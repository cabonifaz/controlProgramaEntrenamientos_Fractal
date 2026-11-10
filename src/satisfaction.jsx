import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { MessageSquareText, Repeat2, Search } from 'lucide-react'
import { apiRequest } from './api'
import { ErrorNote } from './admin.jsx'

// Satisfaccion de las clases: el alumno reacciona a cada tema ya dictado
// (1..5 y "que se repita") y deja comentarios cortos sobre un tema, un
// curso (componente) o un profesor. El instructor ve cantidades de sus
// temas; el admin ve el tablero completo, los pedidos de repetir y los
// comentarios.

export const SATISFACTION = [
  { value: 1, emoji: '😞', label: 'Muy mala' },
  { value: 2, emoji: '😕', label: 'Mala' },
  { value: 3, emoji: '😐', label: 'Regular' },
  { value: 4, emoji: '🙂', label: 'Buena' },
  { value: 5, emoji: '🤩', label: 'Excelente' },
]
export const FEEDBACK_MAX = 500
const FEEDBACK_TYPE_LABEL = { topic: 'Tema', component: 'Curso', instructor: 'Profesor' }

export const canReact = (topic, today) => topic.column === 'completed' || Boolean(topic.scheduledOn && topic.scheduledOn <= today)
const emojiFor = (avg) => (avg === null || avg === undefined ? '—' : SATISFACTION[Math.min(4, Math.max(0, Math.round(avg) - 1))].emoji)
const fmtAvg = (avg) => (avg === null || avg === undefined ? '—' : avg.toFixed(1).replace('.', ','))

// ===================================================================
// Reacciones propias del alumno: un solo store para todas las vistas
// (Mis temas, Mi horario, Asistencia, Avance), asi cambiar en una se ve
// en las demas sin recargar.
const store = { token: null, map: new Map(), loaded: false, listeners: new Set(), version: 0 }
const emit = () => { store.version += 1; store.listeners.forEach((l) => l()) }

function loadReactions(token) {
  if (store.token === token && store.loaded) return
  store.token = token
  store.loaded = true
  apiRequest('/api/reactions/mine', { token })
    .then(({ data }) => { store.map = new Map(data.map((r) => [r.topicId, r])); emit() })
    .catch(() => { store.loaded = false })
}

export function useMyReactions(token) {
  useEffect(() => { loadReactions(token) }, [token])
  useSyncExternalStore((l) => { store.listeners.add(l); return () => store.listeners.delete(l) }, () => store.version)
  async function setReaction(topicId, next) {
    const previous = store.map.get(topicId)
    store.map = new Map(store.map).set(topicId, { topicId, satisfaction: null, wantsRepeat: false, ...previous, ...next })
    emit()
    const value = store.map.get(topicId)
    try {
      await apiRequest(`/api/topics/${topicId}/reaction`, { method: 'POST', token, body: { satisfaction: value.satisfaction, wantsRepeat: value.wantsRepeat } })
    } catch (err) {
      const rollback = new Map(store.map)
      if (previous) rollback.set(topicId, previous)
      else rollback.delete(topicId)
      store.map = rollback
      emit()
      throw err
    }
  }
  return { reactions: store.map, setReaction }
}

export function ReactionEmoji({ reaction }) {
  if (!reaction?.satisfaction && !reaction?.wantsRepeat) return null
  const level = SATISFACTION.find((s) => s.value === reaction.satisfaction)
  return (
    <span className="sf-mine" title={[level && `Te pareció ${level.label.toLowerCase()}`, reaction.wantsRepeat && 'Pediste que se repita'].filter(Boolean).join(' · ')}>
      {level && <span aria-hidden="true">{level.emoji}</span>}
      {reaction.wantsRepeat && <Repeat2 size={13} aria-hidden="true" />}
      <span className="sr-only">{level ? level.label : ''}{reaction.wantsRepeat ? ', pediste que se repita' : ''}</span>
    </span>
  )
}

// Selector de 5 caras + "quiero que se repita".
export function ReactionPicker({ token, topic, today }) {
  const { reactions, setReaction } = useMyReactions(token)
  const [error, setError] = useState('')
  const mine = reactions.get(topic.id)
  if (!canReact(topic, today)) {
    return (
      <section className="sf-picker">
        <h4>¿Qué te pareció esta clase?</h4>
        <p className="muted">Podrás calificarla cuando se dicte.</p>
      </section>
    )
  }
  const save = (next) => { setError(''); setReaction(topic.id, next).catch((err) => setError(err.message)) }
  return (
    <section className="sf-picker">
      <h4>¿Qué te pareció esta clase?</h4>
      <div className="sf-faces" role="radiogroup" aria-label="Tu satisfacción con la clase">
        {SATISFACTION.map((s) => {
          const on = mine?.satisfaction === s.value
          return (
            <button key={s.value} type="button" role="radio" aria-checked={on} className={on ? 'sf-face on' : 'sf-face'} onClick={() => save({ satisfaction: on ? null : s.value })}>
              <span className="sf-face-emoji" aria-hidden="true">{s.emoji}</span>
              <span className="sf-face-label">{s.label}</span>
            </button>
          )
        })}
      </div>
      <button type="button" className={mine?.wantsRepeat ? 'sf-repeat on' : 'sf-repeat'} aria-pressed={!!mine?.wantsRepeat} onClick={() => save({ wantsRepeat: !mine?.wantsRepeat })}>
        <Repeat2 size={15} aria-hidden="true" /> {mine?.wantsRepeat ? 'Pediste que se repita' : 'Quiero que se repita'}
      </button>
      <ErrorNote message={error} />
    </section>
  )
}

// Comentario corto. targets: [{ key, type, label, topicId?, componentId?, groupId? }]
export function FeedbackForm({ token, targets, onDone, onCancel }) {
  const [targetKey, setTargetKey] = useState(targets[0]?.key)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const target = targets.find((t) => t.key === targetKey) || targets[0]

  async function send(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiRequest('/api/feedback', {
        method: 'POST', token,
        body: { targetType: target.type, topicId: target.topicId ?? null, componentId: target.componentId ?? null, groupId: target.groupId ?? null, message: message.trim() },
      })
      onDone?.(`Gracias. Tu comentario sobre ${target.label.toLowerCase().startsWith('el ') ? target.label : `«${target.label}»`} le llega al administrador.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="sf-feedback" onSubmit={send}>
      <h4>Dejar un comentario</h4>
      {targets.length > 1 && (
        <div className="sf-targets" role="radiogroup" aria-label="Sobre qué es tu comentario">
          {targets.map((t) => (
            <button key={t.key} type="button" role="radio" aria-checked={t.key === target.key} className={t.key === target.key ? 'sf-target on' : 'sf-target'} onClick={() => setTargetKey(t.key)}>
              <small>{FEEDBACK_TYPE_LABEL[t.type]}</small>{t.label}
            </button>
          ))}
        </div>
      )}
      <label>Comentario
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={FEEDBACK_MAX} required placeholder="Qué funcionó, qué mejorarías…" />
        <span className={message.length >= FEEDBACK_MAX ? 'pf-count limit' : 'pf-count'}>{message.length}/{FEEDBACK_MAX}</span>
      </label>
      <p className="muted sf-note">Lo lee el administrador del programa, con tu nombre.</p>
      <ErrorNote message={error} />
      <div className="st-form-actions">
        <button type="submit" className="primary" disabled={busy || !message.trim()}>{busy ? 'Enviando…' : 'Enviar comentario'}</button>
        {onCancel && <button type="button" className="btn-mini" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  )
}

// ===================================================================
// Instructor/admin: totales por tema.
export function useReactionSummary(token, enabled = true) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    apiRequest('/api/reactions/summary', { token })
      .then(({ data }) => { if (!cancelled) setRows(data) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [token, enabled])
  const byTopic = useMemo(() => new Map((rows || []).map((r) => [r.topicId, r])), [rows])
  return { rows, byTopic, error }
}

// Suma varias filas por tema en un solo total.
export function aggregate(rows) {
  const distribution = [0, 0, 0, 0, 0]
  let repeatCount = 0
  for (const r of rows) {
    r.distribution.forEach((n, i) => { distribution[i] += n })
    repeatCount += r.repeatCount
  }
  const votes = distribution.reduce((a, b) => a + b, 0)
  const avg = votes ? distribution.reduce((sum, n, i) => sum + n * (i + 1), 0) / votes : null
  const satisfied = votes ? Math.round((100 * (distribution[3] + distribution[4])) / votes) : null
  return { votes, avg, distribution, repeatCount, satisfied, topics: rows.length }
}

export function ReactionChip({ summary }) {
  if (!summary || (!summary.votes && !summary.repeatCount)) return null
  return (
    <span className="pg-chip sf-chip" title={`Satisfacción ${fmtAvg(summary.avg)}/5 · ${summary.votes} voto${summary.votes === 1 ? '' : 's'}${summary.repeatCount ? ` · ${summary.repeatCount} piden repetir` : ''}`}>
      {summary.votes > 0 && <><span aria-hidden="true">{emojiFor(summary.avg)}</span> {fmtAvg(summary.avg)} · {summary.votes}</>}
      {summary.repeatCount > 0 && <><Repeat2 size={12} aria-hidden="true" /> {summary.repeatCount}</>}
    </span>
  )
}

export function DistributionBar({ distribution, votes }) {
  if (!votes) return <span className="muted">Sin votos</span>
  return (
    <span className="sf-dist" role="img" aria-label={SATISFACTION.map((s, i) => `${s.label}: ${distribution[i]}`).join(', ')}>
      {distribution.map((n, i) => n > 0 && <span key={i} className={`sf-seg s${i + 1}`} style={{ flexGrow: n }} title={`${SATISFACTION[i].emoji} ${SATISFACTION[i].label}: ${n}`} />)}
    </span>
  )
}

export function ReactionBreakdown({ summary }) {
  return (
    <section className="sf-breakdown">
      <h4>Reacciones de los alumnos</h4>
      {!summary || (!summary.votes && !summary.repeatCount) ? <p className="muted">Todavía nadie reaccionó a este tema.</p> : (
        <>
          <ul className="sf-levels">
            {SATISFACTION.slice().reverse().map((s) => {
              const n = summary.distribution[s.value - 1]
              return (
                <li key={s.value}>
                  <span className="sf-level-emoji" aria-hidden="true">{s.emoji}</span>
                  <span className="sf-level-label">{s.label}</span>
                  <span className="sf-level-bar"><span className={`s${s.value}`} style={{ width: summary.votes ? `${(100 * n) / summary.votes}%` : 0 }} /></span>
                  <b>{n}</b>
                </li>
              )
            })}
          </ul>
          <p className="sf-breakdown-foot">
            <span><b>{fmtAvg(summary.avg)}</b>/5 promedio · {summary.votes} voto{summary.votes === 1 ? '' : 's'}</span>
            {summary.repeatCount > 0 && <span className="pg-chip warn"><Repeat2 size={12} aria-hidden="true" /> {summary.repeatCount} quiere{summary.repeatCount === 1 ? '' : 'n'} que se repita</span>}
          </p>
        </>
      )}
    </section>
  )
}

// ===================================================================
// Admin: tablero de satisfaccion.
function groupRows(rows, keyOf, labelOf) {
  const map = new Map()
  for (const r of rows) {
    const key = keyOf(r)
    if (key === null || key === undefined) continue
    if (!map.has(key)) map.set(key, { key, label: labelOf(r), rows: [] })
    map.get(key).rows.push(r)
  }
  return [...map.values()].map((g) => ({ ...g, ...aggregate(g.rows) })).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || b.votes - a.votes)
}

function StatsTable({ title, rows, labelHeader }) {
  return (
    <section className="sf-table-card">
      <h4>{title}</h4>
      {!rows.length ? <p className="muted">Sin datos todavía.</p> : (
        <div className="table-fit">
          <table className="admin-table sf-table">
            <thead><tr><th>{labelHeader}</th><th>Satisfacción</th><th>Distribución</th><th>Votos</th><th>Piden repetir</th></tr></thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.key}>
                  <td className="sf-name">{g.label}</td>
                  <td className="sf-avg"><span aria-hidden="true">{emojiFor(g.avg)}</span> <b>{fmtAvg(g.avg)}</b>{g.satisfied !== null && <small> · {g.satisfied}% satisfechos</small>}</td>
                  <td><DistributionBar distribution={g.distribution} votes={g.votes} /></td>
                  <td>{g.votes}</td>
                  <td>{g.repeatCount || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const SF_TABS = [['summary', 'Resumen'], ['repeat', 'Pedidos de repetir'], ['feedback', 'Comentarios']]

export function SatisfactionPanel({ session }) {
  const { token } = session
  const { rows, error } = useReactionSummary(token)
  const [feedback, setFeedback] = useState(null)
  const [feedbackError, setFeedbackError] = useState('')
  const [programId, setProgramId] = useState('')
  const [tab, setTab] = useState('summary')
  const [type, setType] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    apiRequest('/api/feedback', { token }).then(({ data }) => setFeedback(data)).catch((err) => setFeedbackError(err.message))
  }, [token])

  const programs = useMemo(() => {
    const map = new Map()
    for (const r of rows || []) map.set(r.programId, r.programName)
    for (const f of feedback || []) if (f.program_id) map.set(f.program_id, f.program_name)
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [rows, feedback])

  const scoped = useMemo(() => (rows || []).filter((r) => !programId || String(r.programId) === programId), [rows, programId])
  const total = useMemo(() => aggregate(scoped), [scoped])
  const byProgram = useMemo(() => groupRows(scoped, (r) => r.programId, (r) => r.programName), [scoped])
  const byComponent = useMemo(() => groupRows(scoped, (r) => r.componentId, (r) => `${r.componentName}${programId ? '' : ` · ${r.programName}`}`), [scoped, programId])
  const byInstructor = useMemo(() => groupRows(scoped, (r) => r.instructorId, (r) => r.instructorName || 'Sin asignar'), [scoped])
  const repeat = useMemo(() => scoped.filter((r) => r.repeatCount > 0).sort((a, b) => b.repeatCount - a.repeatCount || (b.avg ?? 0) - (a.avg ?? 0)), [scoped])
  const voted = scoped.filter((r) => r.votes > 0)
  const best = [...voted].sort((a, b) => b.avg - a.avg || b.votes - a.votes).slice(0, 5)
  const worst = [...voted].sort((a, b) => a.avg - b.avg || b.votes - a.votes).filter((r) => r.avg < 4).slice(0, 5)

  const comments = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (feedback || []).filter((f) => (!programId || String(f.program_id) === programId) && (!type || f.target_type === type)
      && (!q || [f.message, f.student_name, f.topic_title, f.component_name, f.instructor_name].some((v) => (v || '').toLowerCase().includes(q))))
  }, [feedback, programId, type, query])
  const commentCount = (feedback || []).filter((f) => !programId || String(f.program_id) === programId).length

  if (error) return <div className="admin-wrap"><ErrorNote message={error} /></div>
  if (!rows) return <div className="admin-wrap"><p className="muted">Cargando…</p></div>

  return (
    <div className="admin-wrap sf-wrap">
      <section className="panel">
        <div className="sf-head">
          <div>
            <h3>Satisfacción de las clases</h3>
            <p className="muted">Reacciones de los alumnos a cada tema dictado, pedidos de repetir y sus comentarios.</p>
          </div>
          {programs.length > 1 && (
            <label className="pf-select"><span className="sr-only">Programa</span>
              <select value={programId} onChange={(e) => setProgramId(e.target.value)}>
                <option value="">Todos los programas</option>
                {programs.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="sf-kpis">
          <div className="pg-stat"><span className="pg-stat-label">Satisfacción promedio</span><strong><span aria-hidden="true">{emojiFor(total.avg)}</span> {fmtAvg(total.avg)}<small>/5</small></strong><small className="muted">{total.satisfied !== null ? `${total.satisfied}% satisfechos (buena o excelente)` : 'Sin votos todavía'}</small></div>
          <div className="pg-stat"><span className="pg-stat-label">Votos</span><strong>{total.votes}</strong><small className="muted">en {voted.length} tema{voted.length === 1 ? '' : 's'}</small></div>
          <div className="pg-stat"><span className="pg-stat-label">Piden repetir</span><strong>{total.repeatCount}</strong><small className="muted">{repeat.length} tema{repeat.length === 1 ? '' : 's'} con pedidos</small></div>
          <div className="pg-stat"><span className="pg-stat-label">Comentarios</span><strong>{feedback ? commentCount : '…'}</strong><small className="muted">de tema, curso o profesor</small></div>
        </div>
        <div className="pg-tabs" role="tablist" aria-label="Vista de satisfacción">
          {SF_TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'pg-tab active' : 'pg-tab'} onClick={() => setTab(key)}>
              {key === 'repeat' && <Repeat2 size={15} aria-hidden="true" />}{key === 'feedback' && <MessageSquareText size={15} aria-hidden="true" />}{label}
            </button>
          ))}
        </div>

        {tab === 'summary' && (
          <div className="sf-summary">
            {!programId && <StatsTable title="Por programa" labelHeader="Programa" rows={byProgram} />}
            <StatsTable title="Por curso" labelHeader="Curso" rows={byComponent} />
            <StatsTable title="Por profesor" labelHeader="Profesor" rows={byInstructor} />
            <div className="sf-rank">
              <section className="sf-table-card">
                <h4>Temas mejor valorados</h4>
                {best.length ? <ol className="sf-rank-list">{best.map((r) => <li key={r.topicId}><span aria-hidden="true">{emojiFor(r.avg)}</span><span><b>{r.topicTitle}</b><small>{r.componentName} · {r.instructorName || 'Sin profesor'}</small></span><em>{fmtAvg(r.avg)} · {r.votes}</em></li>)}</ol> : <p className="muted">Sin votos todavía.</p>}
              </section>
              <section className="sf-table-card">
                <h4>Temas a revisar</h4>
                {worst.length ? <ol className="sf-rank-list">{worst.map((r) => <li key={r.topicId}><span aria-hidden="true">{emojiFor(r.avg)}</span><span><b>{r.topicTitle}</b><small>{r.componentName} · {r.instructorName || 'Sin profesor'}</small></span><em>{fmtAvg(r.avg)} · {r.votes}</em></li>)}</ol> : <p className="muted">Ningún tema por debajo de “Buena”.</p>}
              </section>
            </div>
          </div>
        )}

        {tab === 'repeat' && (
          <div className="sf-table-card">
            <p className="muted">Temas que los alumnos quieren que se repitan, para planificarlos a futuro.</p>
            {!repeat.length ? <p className="muted">Todavía no hay pedidos de repetir.</p> : (
              <div className="table-fit">
                <table className="admin-table sf-table">
                  <thead><tr><th>Tema</th><th>Curso</th><th>Profesor</th><th>Piden repetir</th><th>Satisfacción</th></tr></thead>
                  <tbody>
                    {repeat.map((r) => (
                      <tr key={r.topicId}>
                        <td className="sf-name">{r.topicTitle}<small className="muted">{r.programName}{r.scheduledOn ? ` · ${r.scheduledOn}` : ''}</small></td>
                        <td>{r.componentName}</td>
                        <td>{r.instructorName || '—'}</td>
                        <td><span className="pg-chip warn"><Repeat2 size={12} aria-hidden="true" /> {r.repeatCount}</span></td>
                        <td className="sf-avg">{r.votes ? <><span aria-hidden="true">{emojiFor(r.avg)}</span> {fmtAvg(r.avg)}</> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'feedback' && (
          <div className="sf-comments">
            <div className="pf-filters">
              <label className="pf-search"><Search size={15} aria-hidden="true" /><span className="sr-only">Buscar comentario</span>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en comentarios, alumno, tema…" />
              </label>
              <div className="sf-type-filter" role="group" aria-label="Tipo de comentario">
                {[['', 'Todos'], ['topic', 'Tema'], ['component', 'Curso'], ['instructor', 'Profesor']].map(([k, label]) => (
                  <button key={k || 'all'} type="button" aria-pressed={type === k} className={type === k ? 'tab-button active' : 'tab-button'} onClick={() => setType(k)}>{label}</button>
                ))}
              </div>
            </div>
            <ErrorNote message={feedbackError} />
            {feedback && !comments.length && <p className="muted">{feedback.length ? 'Ningún comentario coincide.' : 'Todavía no hay comentarios.'}</p>}
            <ul className="sf-comment-list">
              {comments.map((f) => (
                <li key={f.id} className="sf-comment">
                  <div className="sf-comment-head">
                    <span className={`pill sf-type sf-type-${f.target_type}`}>{FEEDBACK_TYPE_LABEL[f.target_type]}</span>
                    <strong>{f.target_type === 'topic' ? f.topic_title : f.target_type === 'component' ? f.component_name : f.instructor_name}</strong>
                    <span className="muted">{f.target_type === 'topic' ? `${f.component_name} · ` : f.target_type === 'instructor' ? `${f.component_name} · ` : ''}{f.program_name}</span>
                  </div>
                  <p>{f.message}</p>
                  <small className="muted">{f.student_name} · {new Date(f.created_at).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}</small>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
