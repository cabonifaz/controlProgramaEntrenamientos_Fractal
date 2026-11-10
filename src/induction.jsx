import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown, ArrowUp, BookOpen, CheckCircle2, CheckSquare, ClipboardCheck, Flag, Lock, Pencil, PlayCircle, Plus,
  Search, Sparkles, Trash2, Trophy, Video, XCircle,
} from 'lucide-react'
import { apiRequest } from './api'
import { ErrorNote, Modal } from './admin.jsx'

// Induccion: el camino paso a paso que cada persona debe recorrer (videos,
// lecturas, cuestionarios calificados, tareas y sesiones en vivo), y el
// tablero del admin para ver quien cumplio y donde reforzar.

export const STEP_META = {
  video: { label: 'Video', Icon: PlayCircle, done: 'Marcar como visto' },
  reading: { label: 'Lectura', Icon: BookOpen, done: 'Marcar como leído' },
  quiz: { label: 'Cuestionario', Icon: ClipboardCheck, done: null },
  task: { label: 'Tarea', Icon: CheckSquare, done: 'Marcar como hecha' },
  meeting: { label: 'Sesión en vivo', Icon: Video, done: 'Marcar asistencia' },
}
const STATUS_LABEL = { completed: 'Completado', failed: 'No aprobado', started: 'En curso' }
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '')
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('es', { dateStyle: 'medium' }) : '—')

// Link embebible de YouTube, Vimeo, Google Drive o Microsoft Stream.
export function embedUrl(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtube.com' && u.searchParams.get('v')) return `https://www.youtube-nocookie.com/embed/${u.searchParams.get('v')}`
    if (host === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`
    if (host === 'youtube.com' && u.pathname.startsWith('/embed/')) return url
    if (host === 'vimeo.com' && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video/${u.pathname.split('/')[1]}`
    if (host === 'drive.google.com' && /\/file\/d\//.test(u.pathname)) return `https://drive.google.com/file/d/${u.pathname.split('/')[3]}/preview`
    if (host.endsWith('microsoftstream.com') || host.endsWith('sharepoint.com')) return url
  } catch { /* link invalido */ }
  return null
}

function StepIcon({ type, size = 16 }) {
  const { Icon } = STEP_META[type] || STEP_META.task
  return <Icon size={size} aria-hidden="true" />
}

function stepState(step, progress, unlocked) {
  const p = progress?.[step.id]
  if (p?.status === 'completed') return 'done'
  if (!unlocked) return 'locked'
  if (p?.status === 'failed') return 'failed'
  return 'todo'
}

// ===================================================================
// El caminito: etapas como hitos de una ruta y sus pasos.
export function JourneyPath({ stages, progress, onOpen, readOnly = false }) {
  return (
    <ol className="ij-path">
      {stages.map((st, i) => {
        const unlocked = st.unlocked !== false
        const stageState = st.complete ? 'done' : unlocked ? 'current' : 'locked'
        return (
          <li key={st.id} className={`ij-stage ${stageState}`}>
            <div className="ij-milestone" aria-hidden="true">{st.complete ? <CheckCircle2 size={20} /> : unlocked ? i + 1 : <Lock size={16} />}</div>
            <div className="ij-stage-body">
              <div className="ij-stage-head">
                <h4>{st.name}</h4>
                <span className={`ij-stage-tag ${stageState}`}>{st.complete ? 'Etapa completa' : unlocked ? `${st.requiredDone ?? 0} de ${st.requiredTotal ?? st.steps.filter((s) => s.required).length} obligatorios` : 'Se abre al completar la etapa anterior'}</span>
              </div>
              {st.description && <p className="muted ij-stage-desc">{st.description}</p>}
              {!st.steps.length && <p className="muted">Esta etapa todavía no tiene pasos.</p>}
              <ul className="ij-steps">
                {st.steps.map((s) => {
                  const state = stepState(s, progress, unlocked)
                  const p = progress?.[s.id]
                  return (
                    <li key={s.id}>
                      <button type="button" className={`ij-step ${state}`} onClick={() => onOpen?.(s, st)} disabled={!onOpen || (state === 'locked' && !readOnly)} aria-label={`${STEP_META[s.type]?.label}: ${s.title}${s.required ? ' (obligatorio)' : ''} — ${state === 'done' ? 'completado' : state === 'locked' ? 'bloqueado' : state === 'failed' ? 'no aprobado' : 'pendiente'}`}>
                        <span className="ij-step-dot" aria-hidden="true">{state === 'done' ? <CheckCircle2 size={18} /> : state === 'failed' ? <XCircle size={18} /> : state === 'locked' ? <Lock size={14} /> : <StepIcon type={s.type} />}</span>
                        <span className="ij-step-text">
                          <strong>{s.title}</strong>
                          <small>{STEP_META[s.type]?.label}{s.estMinutes ? ` · ${s.estMinutes} min` : ''}{s.type === 'meeting' && s.scheduledAt ? ` · ${fmtDateTime(s.scheduledAt)}` : ''}{p?.score !== null && p?.score !== undefined ? ` · nota ${Math.round(p.score)}%` : ''}</small>
                        </span>
                        {s.required ? <span className="ij-req">Obligatorio</span> : <span className="ij-opt">Opcional</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </li>
        )
      })}
      <li className="ij-stage finish" aria-hidden="true"><div className="ij-milestone"><Flag size={18} /></div><div className="ij-stage-body"><h4>Meta: inducción cumplida</h4></div></li>
    </ol>
  )
}

// ===================================================================
// Alumno: abrir un paso y completarlo.
function QuizForm({ token, step, onDone }) {
  const [answers, setAnswers] = useState(() => step.quiz.map(() => null))
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data } = await apiRequest(`/api/induction/steps/${step.id}/quiz`, { method: 'POST', token, body: { answers } })
      setResult(data)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="ij-quiz" onSubmit={submit}>
      {result && (
        <div className={result.passed ? 'ij-result ok' : 'ij-result bad'} role="status">
          {result.passed ? <Trophy size={22} aria-hidden="true" /> : <XCircle size={22} aria-hidden="true" />}
          <div><strong>{result.passed ? '¡Aprobado!' : 'Todavía no apruebas'} · {Math.round(result.score)}%</strong><span>Nota mínima: {result.minScore}%{result.passed ? '' : '. Revisa las explicaciones e inténtalo de nuevo.'}</span></div>
        </div>
      )}
      <ol className="ij-questions">
        {step.quiz.map((q, i) => {
          const r = result?.results?.[i]
          return (
            <li key={i} className={r ? (r.correct ? 'ok' : 'bad') : ''}>
              <fieldset disabled={Boolean(result)}>
                <legend>{q.enunciado}</legend>
                {(q.tipo === 'vf' ? [['Verdadero', true], ['Falso', false]] : q.opciones.map((o, k) => [o, String.fromCharCode(65 + k)])).map(([label, value]) => (
                  <label key={String(value)} className="ij-option">
                    <input type="radio" name={`q-${step.id}-${i}`} checked={answers[i] === value} onChange={() => setAnswers((a) => a.map((x, k) => (k === i ? value : x)))} required />
                    <span>{q.tipo === 'opcion' ? `${value}. ` : ''}{label}</span>
                  </label>
                ))}
              </fieldset>
              {r && !r.correct && <p className="ij-feedback">Respuesta correcta: <b>{typeof r.respuesta === 'boolean' ? (r.respuesta ? 'Verdadero' : 'Falso') : r.respuesta}</b>{r.explicacion ? ` — ${r.explicacion}` : ''}</p>}
              {r && r.correct && r.explicacion && <p className="ij-feedback ok">{r.explicacion}</p>}
            </li>
          )
        })}
      </ol>
      <ErrorNote message={error} />
      {result
        ? !result.passed && <button type="button" className="primary" onClick={() => { setResult(null); setAnswers(step.quiz.map(() => null)) }}>Intentar de nuevo</button>
        : <button type="submit" className="primary" disabled={busy || answers.some((a) => a === null)}>{busy ? 'Calificando…' : 'Enviar respuestas'}</button>}
    </form>
  )
}

function StepPlayer({ token, step, progress, onClose, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const p = progress?.[step.id]
  const done = p?.status === 'completed'
  const embed = step.type === 'video' ? embedUrl(step.url) : null
  async function complete() {
    setBusy(true)
    setError('')
    try {
      await apiRequest(`/api/induction/steps/${step.id}/complete`, { method: 'POST', token })
      onChanged()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={step.title} onClose={onClose} wide>
      <div className="ij-player">
        <p className="ij-player-meta"><StepIcon type={step.type} /> {STEP_META[step.type]?.label}{step.required ? ' · Obligatorio' : ' · Opcional'}{step.estMinutes ? ` · ${step.estMinutes} min` : ''}{done ? ` · Completado el ${fmtDate(p.completedAt)}` : ''}</p>
        {step.description && <p className="ij-desc">{step.description}</p>}
        {embed && <div className="ij-video"><iframe src={embed} title={step.title} allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" /></div>}
        {step.url && !embed && step.type !== 'quiz' && (
          <a className={step.type === 'meeting' ? 'cl-join' : 'btn-mini ij-open'} href={step.url} target="_blank" rel="noreferrer">
            {step.type === 'meeting' ? <><Video size={18} aria-hidden="true" /> Unirse a la sesión</> : step.type === 'video' ? 'Abrir el video' : 'Abrir la lectura'}
          </a>
        )}
        {step.type === 'meeting' && step.scheduledAt && <p className="ij-when"><strong>Fecha:</strong> {fmtDateTime(step.scheduledAt)}</p>}
        {step.type === 'quiz'
          ? <QuizForm token={token} step={step} onDone={onChanged} />
          : !done && STEP_META[step.type]?.done && <button type="button" className="primary ij-complete" onClick={complete} disabled={busy}><CheckCircle2 size={16} aria-hidden="true" /> {busy ? 'Guardando…' : STEP_META[step.type].done}</button>}
        {done && step.type !== 'quiz' && <p className="ij-result ok" role="status"><CheckCircle2 size={20} aria-hidden="true" /> <span>Paso completado</span></p>}
        <ErrorNote message={error} />
      </div>
    </Modal>
  )
}

function useInductionPrograms(token) {
  const [programs, setPrograms] = useState(null)
  const [error, setError] = useState('')
  const reload = useCallback(() => apiRequest('/api/induction/programs', { token }).then(({ data }) => setPrograms(data)).catch((err) => setError(err.message)), [token])
  useEffect(() => { reload() }, [reload])
  return { programs, error, reload }
}

function ProgramSelect({ programs, value, onChange }) {
  if (!programs || programs.length < 2) return null
  return (
    <label className="pf-select ij-program-select"><span>Inducción</span>
      <select value={value || ''} onChange={(e) => onChange(Number(e.target.value))}>
        {programs.map((p) => <option key={p.id} value={p.id}>{p.name}{p.cohort ? ` · ${p.cohort}` : ''}</option>)}
      </select>
    </label>
  )
}

export function MyInductionPanel({ session }) {
  const { token } = session
  const { programs, error } = useInductionPrograms(token)
  const [programId, setProgramId] = useState(null)
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null)
  const current = programId || programs?.[0]?.id
  const load = useCallback(() => { if (current) apiRequest(`/api/induction/${current}`, { token }).then(({ data }) => setData(data)).catch(() => {}) }, [current, token])
  useEffect(() => { setData(null); load() }, [load])

  if (error) return <div className="admin-wrap"><ErrorNote message={error} /></div>
  if (!programs) return <div className="admin-wrap"><p className="muted">Cargando…</p></div>
  if (!programs.length) return <div className="admin-wrap"><section className="panel"><h3>Mi inducción</h3><p className="muted">No tienes una inducción asignada.</p></section></div>
  return (
    <div className="admin-wrap">
      <section className="panel ij-wrap">
        <div className="ij-head">
          <div>
            <p className="kicker">Mi inducción</p>
            <h3>{data?.program.name || '…'}</h3>
            {data?.program.description && <p className="muted">{data.program.description}</p>}
          </div>
          <ProgramSelect programs={programs} value={current} onChange={setProgramId} />
        </div>
        {data && (
          <>
            <div className={data.completed ? 'ij-summary done' : 'ij-summary'}>
              {data.completed ? <Trophy size={28} aria-hidden="true" /> : <div className="ij-ring" style={{ '--pct': data.pct }}><span>{data.pct}%</span></div>}
              <div>
                <strong>{data.completed ? '¡Completaste tu inducción!' : `${data.requiredDone} de ${data.requiredTotal} pasos obligatorios`}</strong>
                <span className="muted">{data.completed ? 'Todos los pasos obligatorios están hechos.' : data.program.sequential ? 'Avanza en orden: cada etapa se abre al terminar los pasos obligatorios de la anterior.' : 'Puedes avanzar en el orden que prefieras.'}{data.avgScore !== null ? ` Nota promedio: ${data.avgScore}%.` : ''}</span>
              </div>
            </div>
            <JourneyPath stages={data.stages} progress={data.progress} onOpen={(s) => setOpen(s)} />
          </>
        )}
      </section>
      {open && <StepPlayer token={token} step={open} progress={data?.progress} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}

// ===================================================================
// Admin: editor del camino.
const EMPTY_STEP = { type: 'video', title: '', description: '', url: '', required: true, minScore: 70, estMinutes: '', scheduledAt: '', quiz: [] }
const URL_HINT = { video: 'https://www.youtube.com/watch?v=… (YouTube, Vimeo, Drive o Stream)', reading: 'https://… (página o documento)', task: 'https://… (opcional)', meeting: 'https://teams.microsoft.com/l/meetup-join/…', quiz: '' }

function QuizBuilder({ token, programId, quiz, onChange, topicHint }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const update = (i, patch) => onChange(quiz.map((q, k) => (k === i ? { ...q, ...patch } : q)))
  async function suggest() {
    setBusy(true)
    setError('')
    try {
      const { data } = await apiRequest(`/api/induction/${programId}/ai-quiz`, { method: 'POST', token, body: { topic: topicHint, count: 5 } })
      onChange([...quiz, ...data])
    } catch (err) {
      setError(err.message === 'ai_not_configured' ? 'Falta configurar la clave de OpenAI en el servidor.' : err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="ij-builder">
      <div className="ij-builder-head">
        <strong>Preguntas ({quiz.length})</strong>
        <div className="row-actions">
          <button type="button" className="btn-mini" onClick={suggest} disabled={busy || !topicHint.trim()} title={topicHint.trim() ? 'La IA propone 5 preguntas; revísalas antes de guardar' : 'Escribe primero el título o la descripción'}><Sparkles size={13} aria-hidden="true" /> {busy ? 'Pensando…' : 'Sugerir con IA'}</button>
          <button type="button" className="btn-mini" onClick={() => onChange([...quiz, { tipo: 'opcion', enunciado: '', opciones: ['', '', '', ''], respuesta: 'A', explicacion: '' }])}><Plus size={13} aria-hidden="true" /> Opción múltiple</button>
          <button type="button" className="btn-mini" onClick={() => onChange([...quiz, { tipo: 'vf', enunciado: '', respuesta: true, explicacion: '' }])}><Plus size={13} aria-hidden="true" /> Verdadero/falso</button>
        </div>
      </div>
      <ErrorNote message={error} />
      <ol className="ij-builder-list">
        {quiz.map((q, i) => (
          <li key={i}>
            <div className="ij-q-row">
              <label className="ij-q-text">Pregunta {i + 1}<input value={q.enunciado} onChange={(e) => update(i, { enunciado: e.target.value })} maxLength={600} required /></label>
              <button type="button" className="cl-remove" onClick={() => onChange(quiz.filter((_, k) => k !== i))} aria-label={`Quitar pregunta ${i + 1}`}><Trash2 size={14} aria-hidden="true" /></button>
            </div>
            {q.tipo === 'vf' ? (
              <div className="ij-q-options" role="radiogroup" aria-label="Respuesta correcta">
                {[['Verdadero', true], ['Falso', false]].map(([l, v]) => <label key={l} className="checkbox-field"><input type="radio" name={`vf-${i}`} checked={q.respuesta === v} onChange={() => update(i, { respuesta: v })} /> {l}</label>)}
              </div>
            ) : (
              <div className="ij-q-options">
                {q.opciones.map((o, k) => {
                  const letter = String.fromCharCode(65 + k)
                  return (
                    <label key={k} className="ij-q-option">
                      <input type="radio" name={`ok-${i}`} checked={q.respuesta === letter} onChange={() => update(i, { respuesta: letter })} aria-label={`Marcar ${letter} como correcta`} />
                      <span>{letter}</span>
                      <input value={o} onChange={(e) => update(i, { opciones: q.opciones.map((x, j) => (j === k ? e.target.value : x)) })} maxLength={300} placeholder={`Opción ${letter}`} aria-label={`Opción ${letter}`} />
                    </label>
                  )
                })}
              </div>
            )}
            <label className="ij-q-expl">Explicación (se muestra al responder)<input value={q.explicacion || ''} onChange={(e) => update(i, { explicacion: e.target.value })} maxLength={600} /></label>
          </li>
        ))}
      </ol>
    </div>
  )
}

function StepForm({ token, programId, stage, step, onClose, onSaved }) {
  const [form, setForm] = useState(() => (step ? { ...EMPTY_STEP, ...step, estMinutes: step.estMinutes ?? '', scheduledAt: step.scheduledAt ? step.scheduledAt.slice(0, 16).replace(' ', 'T') : '', url: step.url || '', description: step.description || '' } : { ...EMPTY_STEP }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const body = { ...form, componentId: stage.id, minScore: Number(form.minScore) || 0, estMinutes: form.estMinutes ? Number(form.estMinutes) : null }
    try {
      if (step) await apiRequest(`/api/induction/steps/${step.id}`, { method: 'PUT', token, body })
      else await apiRequest(`/api/induction/${programId}/steps`, { method: 'POST', token, body })
      onSaved()
    } catch (err) {
      setError(err.message === 'quiz_empty' ? 'Agrega al menos una pregunta completa.' : err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={`${step ? 'Editar paso' : 'Nuevo paso'} · ${stage.name}`} onClose={onClose} wide>
      <form className="admin-form ij-form" onSubmit={save}>
        <fieldset className="full-field ij-types">
          <legend>Tipo de paso</legend>
          {Object.entries(STEP_META).map(([k, m]) => (
            <label key={k} className={form.type === k ? 'ij-type on' : 'ij-type'}>
              <input type="radio" name="step-type" value={k} checked={form.type === k} onChange={set('type')} className="sr-only" />
              <m.Icon size={18} aria-hidden="true" /><span>{m.label}</span>
            </label>
          ))}
        </fieldset>
        <label className="full-field">Título<input value={form.title} onChange={set('title')} maxLength={200} required placeholder="Ej.: Bienvenida del gerente general" /></label>
        <label className="full-field">Descripción o instrucciones<textarea value={form.description} onChange={set('description')} maxLength={2000} placeholder="Qué debe hacer o aprender la persona en este paso" /></label>
        {form.type !== 'quiz' && <label className="full-field">Link{form.type === 'task' ? ' (opcional)' : ''}<input type="url" value={form.url} onChange={set('url')} placeholder={URL_HINT[form.type]} required={form.type === 'video' || form.type === 'reading' || form.type === 'meeting'} /></label>}
        {form.type === 'meeting' && <label>Fecha y hora<input type="datetime-local" value={form.scheduledAt} onChange={set('scheduledAt')} /></label>}
        <label>Duración estimada (min)<input type="number" min="1" max="600" value={form.estMinutes} onChange={set('estMinutes')} /></label>
        {form.type === 'quiz' && <label>Nota mínima para aprobar (%)<input type="number" min="0" max="100" value={form.minScore} onChange={set('minScore')} /></label>}
        <label className="checkbox-field ij-required"><input type="checkbox" checked={form.required} onChange={set('required')} /> Paso obligatorio para cumplir la inducción</label>
        {form.type === 'quiz' && <div className="full-field"><QuizBuilder token={token} programId={programId} quiz={form.quiz} onChange={(quiz) => setForm({ ...form, quiz })} topicHint={`${form.title}. ${form.description}`} /></div>}
        <ErrorNote message={error} />
        <button className="primary" disabled={busy}>{busy ? 'Guardando…' : step ? 'Guardar cambios' : 'Agregar paso'}</button>
      </form>
    </Modal>
  )
}

function PathEditor({ token, programId, data, reload }) {
  const [editing, setEditing] = useState(null)
  const [stageName, setStageName] = useState('')
  const [error, setError] = useState('')
  async function act(fn) {
    setError('')
    try { await fn(); reload() } catch (err) { setError(err.message) }
  }
  return (
    <div className="ij-editor">
      <div className="ij-editor-bar">
        <label className="checkbox-field"><input type="checkbox" checked={data.program.sequential} onChange={(e) => act(() => apiRequest(`/api/programs/${programId}/type`, { method: 'PUT', token, body: { programType: 'induction', sequential: e.target.checked } }))} /> Las etapas se abren en orden (camino obligatorio)</label>
        <form className="ij-new-stage" onSubmit={(e) => { e.preventDefault(); if (stageName.trim()) act(async () => { await apiRequest(`/api/programs/${programId}/components`, { method: 'POST', token, body: { name: stageName.trim(), sortOrder: data.stages.length + 1 } }); setStageName('') }) }}>
          <input value={stageName} onChange={(e) => setStageName(e.target.value)} placeholder="Nombre de la nueva etapa" aria-label="Nombre de la nueva etapa" maxLength={180} />
          <button type="submit" className="btn-mini" disabled={!stageName.trim()}><Plus size={13} aria-hidden="true" /> Agregar etapa</button>
        </form>
      </div>
      <ErrorNote message={error} />
      {!data.stages.length && <p className="muted">Agrega la primera etapa (por ejemplo: “Conoce la empresa”, “Políticas”, “Tu puesto”).</p>}
      <ol className="ij-edit-stages">
        {data.stages.map((st, i) => (
          <li key={st.id} className="ij-edit-stage">
            <div className="ij-edit-stage-head">
              <span className="sch-step-n">{i + 1}</span>
              <h4>{st.name}</h4>
              <span className="muted">{st.steps.length} paso{st.steps.length === 1 ? '' : 's'} · {st.steps.filter((s) => s.required).length} obligatorio{st.steps.filter((s) => s.required).length === 1 ? '' : 's'}</span>
              <button type="button" className="btn-mini" onClick={() => setEditing({ stage: st, step: null })}><Plus size={13} aria-hidden="true" /> Agregar paso</button>
            </div>
            <ul className="ij-edit-steps">
              {st.steps.map((s, k) => (
                <li key={s.id}>
                  <span className="ij-step-dot todo" aria-hidden="true"><StepIcon type={s.type} /></span>
                  <div className="ij-edit-step-text">
                    <strong>{s.title}</strong>
                    <small className="muted">{STEP_META[s.type].label}{s.type === 'quiz' ? ` · ${s.quiz.length} preguntas · aprueba con ${s.minScore}%` : ''}{s.estMinutes ? ` · ${s.estMinutes} min` : ''}{s.url ? ` · ${new URL(s.url).hostname}` : ''}</small>
                  </div>
                  {s.required ? <span className="ij-req">Obligatorio</span> : <span className="ij-opt">Opcional</span>}
                  <div className="row-actions ij-edit-actions">
                    <button type="button" className="cl-remove" onClick={() => act(() => apiRequest(`/api/induction/steps/${s.id}/move`, { method: 'POST', token, body: { direction: 'up' } }))} disabled={k === 0} aria-label={`Subir ${s.title}`} title="Subir"><ArrowUp size={14} aria-hidden="true" /></button>
                    <button type="button" className="cl-remove" onClick={() => act(() => apiRequest(`/api/induction/steps/${s.id}/move`, { method: 'POST', token, body: { direction: 'down' } }))} disabled={k === st.steps.length - 1} aria-label={`Bajar ${s.title}`} title="Bajar"><ArrowDown size={14} aria-hidden="true" /></button>
                    <button type="button" className="cl-remove" onClick={() => setEditing({ stage: st, step: s })} aria-label={`Editar ${s.title}`} title="Editar"><Pencil size={14} aria-hidden="true" /></button>
                    <button type="button" className="cl-remove" onClick={() => window.confirm(`¿Quitar “${s.title}”? Se pierde el avance de los alumnos en este paso.`) && act(() => apiRequest(`/api/induction/steps/${s.id}`, { method: 'DELETE', token }))} aria-label={`Quitar ${s.title}`} title="Quitar"><Trash2 size={14} aria-hidden="true" /></button>
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {editing && <StepForm token={token} programId={programId} stage={editing.stage} step={editing.step} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
    </div>
  )
}

function EnrollTab({ token, programId, students, reload }) {
  const [all, setAll] = useState([])
  const [pick, setPick] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { apiRequest('/api/users?role=student', { token }).then(({ data }) => setAll(data || [])).catch(() => {}) }, [token])
  const enrolledIds = new Set(students.map((s) => s.id))
  const available = all.filter((u) => !enrolledIds.has(u.id) && u.is_active !== 0)
  async function enroll(e) {
    e.preventDefault()
    setError('')
    try {
      await apiRequest(`/api/programs/${programId}/students`, { method: 'POST', token, body: { studentId: Number(pick) } })
      setPick('')
      reload()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <div className="ij-enroll">
      <form className="ij-new-stage" onSubmit={enroll}>
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Persona a inscribir" required>
          <option value="">Elige a quién inscribir…</option>
          {available.map((u) => <option key={u.id} value={u.id}>{u.full_name} · {u.email}</option>)}
        </select>
        <button type="submit" className="primary btn-compact" disabled={!pick}>Inscribir</button>
      </form>
      <ErrorNote message={error} />
      <p className="muted">{students.length} persona{students.length === 1 ? '' : 's'} inscrita{students.length === 1 ? '' : 's'}. Para crear usuarios nuevos usa la sección Usuarios.</p>
    </div>
  )
}

// ===================================================================
// Admin: tablero de avance.
function Dashboard({ data, onOpenStudent }) {
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const steps = data.stages.flatMap((st) => st.steps.map((s) => ({ ...s, stageName: st.name })))
  const students = data.students
  const total = students.length
  const completed = students.filter((s) => s.completed).length
  const notStarted = students.filter((s) => !Object.keys(s.progress).length).length
  const avgPct = total ? Math.round(students.reduce((n, s) => n + s.pct, 0) / total) : 0
  const scores = students.map((s) => s.avgScore).filter((v) => v !== null)
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  // Donde reforzar: obligatorios con menos personas que los completaron y
  // cuestionarios con notas bajas.
  const reinforce = steps.filter((s) => s.required).map((s) => {
    const reached = students.filter((st) => st.progress[s.id])
    const done = students.filter((st) => st.progress[s.id]?.status === 'completed').length
    const failedNow = students.filter((st) => st.progress[s.id]?.status === 'failed').length
    const sc = reached.map((st) => st.progress[s.id]?.score).filter((v) => v !== null && v !== undefined)
    return { ...s, done, pct: total ? Math.round((100 * done) / total) : 0, failedNow, avg: sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null }
  }).sort((a, b) => a.pct - b.pct || (a.avg ?? 101) - (b.avg ?? 101))
  const q = query.trim().toLowerCase()
  const shown = students.filter((s) => (!q || s.name.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q))
    && (!filter || (filter === 'done' ? s.completed : filter === 'none' ? !Object.keys(s.progress).length : !s.completed && Object.keys(s.progress).length)))

  return (
    <div className="ij-dash">
      <div className="ind-kpis">
        <div className="pg-stat ind-kpi"><span className="pg-stat-label">Inscritos</span><strong>{total}</strong><small className="muted">en esta inducción</small></div>
        <div className="pg-stat ind-kpi ok"><span className="pg-stat-label">Completaron</span><strong>{total ? Math.round((100 * completed) / total) : 0}%</strong><small className="muted">{completed} de {total} cumplieron todo lo obligatorio</small></div>
        <div className="pg-stat ind-kpi"><span className="pg-stat-label">Avance promedio</span><strong>{avgPct}%</strong><small className="muted">de los pasos obligatorios</small></div>
        <div className="pg-stat ind-kpi"><span className="pg-stat-label">Nota promedio</span><strong>{avgScore === null ? '—' : `${avgScore}%`}</strong><small className="muted">en los cuestionarios</small></div>
        <div className={notStarted ? 'pg-stat ind-kpi warn' : 'pg-stat ind-kpi'}><span className="pg-stat-label">Sin empezar</span><strong>{notStarted}</strong><small className="muted">todavía no abrieron ningún paso</small></div>
      </div>

      <section className="ind-card">
        <h4>Dónde reforzar</h4>
        {!reinforce.length ? <p className="muted">Agrega pasos obligatorios para ver el avance por paso.</p> : (
          <ul className="ij-funnel">
            {reinforce.map((s) => (
              <li key={s.id}>
                <span className="ij-funnel-name"><StepIcon type={s.type} /> <b>{s.title}</b><small className="muted">{s.stageName}</small></span>
                <span className="ij-funnel-bar" role="img" aria-label={`${s.pct}% lo completó`}><span style={{ width: `${s.pct}%` }} className={s.pct < 50 ? 'low' : s.pct < 80 ? 'mid' : 'high'} /></span>
                <span className="ij-funnel-num">{s.pct}%<small className="muted"> · {s.done}/{total}{s.type === 'quiz' && s.avg !== null ? ` · nota ${s.avg}%` : ''}{s.failedNow ? ` · ${s.failedNow} sin aprobar` : ''}</small></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ind-card">
        <h4>Avance de cada persona</h4>
        <div className="ind-toolbar">
          <label className="pf-search"><Search size={15} aria-hidden="true" /><span className="sr-only">Buscar persona</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o correo…" /></label>
          <div className="sf-type-filter" role="group" aria-label="Estado">
            {[['', 'Todos'], ['done', 'Completaron'], ['doing', 'En curso'], ['none', 'Sin empezar']].map(([k, l]) => <button key={k || 'all'} type="button" aria-pressed={filter === k} className={filter === k ? 'tab-button active' : 'tab-button'} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
        </div>
        {!shown.length ? <p className="muted">{total ? 'Nadie coincide con el filtro.' : 'Todavía no hay personas inscritas. Inscríbelas en la pestaña Alumnos.'}</p> : (
          <div className="table-fit">
            <table className="admin-table ij-matrix">
              <thead><tr><th>Persona</th><th>Camino</th><th>Avance</th><th>Nota</th><th>Etapa actual</th><th>Última actividad</th></tr></thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id}>
                    <td className="ind-name"><button type="button" className="text-button ij-person" onClick={() => onOpenStudent(s)}>{s.name}</button>{s.completed && <span className="ind-pill ind-advance">Cumplió</span>}</td>
                    <td>
                      <span className="ij-dots" aria-label={`${s.requiredDone} de ${s.requiredTotal} obligatorios`}>
                        {data.stages.map((st) => (
                          <span key={st.id} className="ij-dots-stage" title={st.name}>
                            {st.steps.map((step) => {
                              const p = s.progress[step.id]
                              const cls = p?.status === 'completed' ? 'done' : p?.status === 'failed' ? 'failed' : p ? 'started' : 'todo'
                              return <i key={step.id} className={`${cls}${step.required ? '' : ' opt'}`} title={`${st.name} · ${step.title}: ${p ? STATUS_LABEL[p.status] : 'Pendiente'}${p?.score !== null && p?.score !== undefined ? ` (${Math.round(p.score)}%)` : ''}`} />
                            })}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="ij-pct"><span className="ij-mini-bar"><span style={{ width: `${s.pct}%` }} /></span>{s.pct}%</td>
                    <td className="ind-n">{s.avgScore === null ? '—' : `${s.avgScore}%`}</td>
                    <td>{s.completed ? <span className="muted">—</span> : s.currentStage || '—'}</td>
                    <td className="ind-date">{s.lastActivity ? fmtDate(s.lastActivity) : <span className="muted">Sin actividad</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ij-legend muted"><i className="done" /> Completado <i className="failed" /> No aprobado <i className="started" /> En curso <i className="todo" /> Pendiente <i className="todo opt" /> Opcional</p>
      </section>
    </div>
  )
}

function CreateInduction({ token, onCreated }) {
  const [form, setForm] = useState({ name: '', cohort: String(new Date().getFullYear()), description: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function create(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data } = await apiRequest('/api/programs', { method: 'POST', token, body: { name: form.name.trim(), cohort: form.cohort.trim(), description: form.description.trim() || null } })
      await apiRequest(`/api/programs/${data.program_id}/type`, { method: 'PUT', token, body: { programType: 'induction', sequential: true } })
      onCreated(data.program_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="admin-form ij-create" onSubmit={create}>
      <label>Nombre de la inducción<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={180} placeholder="Ej.: Inducción de nuevos colaboradores" /></label>
      <label>Cohorte o periodo<input value={form.cohort} onChange={(e) => setForm({ ...form, cohort: e.target.value })} required maxLength={80} /></label>
      <label className="full-field">Descripción<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Qué logra la persona al terminar" /></label>
      <ErrorNote message={error} />
      <button className="primary" disabled={busy}>{busy ? 'Creando…' : 'Crear inducción'}</button>
    </form>
  )
}

const TABS = [['dashboard', 'Avance'], ['path', 'Camino y pasos'], ['students', 'Alumnos']]

export function InductionAdminPanel({ session }) {
  const { token } = session
  const { programs, error, reload: reloadPrograms } = useInductionPrograms(token)
  const [programId, setProgramId] = useState(null)
  const [tab, setTab] = useState('dashboard')
  const [structure, setStructure] = useState(null)
  const [dash, setDash] = useState(null)
  const [creating, setCreating] = useState(false)
  const [student, setStudent] = useState(null)
  const current = programId || programs?.[0]?.id
  const load = useCallback(() => {
    if (!current) return
    apiRequest(`/api/induction/${current}`, { token }).then(({ data }) => setStructure(data)).catch(() => {})
    apiRequest(`/api/induction/${current}/dashboard`, { token }).then(({ data }) => setDash(data)).catch(() => {})
  }, [current, token])
  useEffect(() => { setStructure(null); setDash(null); load() }, [load])

  if (error) return <div className="admin-wrap"><ErrorNote message={error} /></div>
  if (!programs) return <div className="admin-wrap"><p className="muted">Cargando…</p></div>
  return (
    <div className="admin-wrap">
      <section className="panel ij-wrap">
        <div className="ij-head">
          <div>
            <h3>Inducción</h3>
            <p className="muted">Caminos de inducción con pasos obligatorios (videos, lecturas, cuestionarios calificados y sesiones en vivo), y quién ya los cumplió.</p>
          </div>
          <div className="row-actions">
            <ProgramSelect programs={programs} value={current} onChange={(id) => { setProgramId(id); setTab('dashboard') }} />
            <button type="button" className="btn-mini" onClick={() => setCreating((v) => !v)}><Plus size={13} aria-hidden="true" /> Nueva inducción</button>
          </div>
        </div>
        {(creating || !programs.length) && <CreateInduction token={token} onCreated={async (id) => { await reloadPrograms(); setProgramId(id); setCreating(false); setTab('path') }} />}
        {current && (
          <>
            <div className="pg-tabs" role="tablist" aria-label="Inducción">
              {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'pg-tab active' : 'pg-tab'} onClick={() => setTab(k)}>{l}</button>)}
            </div>
            {tab === 'dashboard' && (dash ? <Dashboard data={dash} onOpenStudent={setStudent} /> : <p className="muted">Cargando…</p>)}
            {tab === 'path' && (structure ? <PathEditor token={token} programId={current} data={structure} reload={load} /> : <p className="muted">Cargando…</p>)}
            {tab === 'students' && (dash ? <EnrollTab token={token} programId={current} students={dash.students} reload={load} /> : <p className="muted">Cargando…</p>)}
          </>
        )}
      </section>
      {student && dash && (
        <Modal title={`Camino de ${student.name}`} onClose={() => setStudent(null)} wide>
          <div className="ij-student">
            <p className="muted">{student.completed ? '✓ Cumplió su inducción.' : `${student.requiredDone} de ${student.requiredTotal} pasos obligatorios (${student.pct}%).`}{student.avgScore !== null ? ` Nota promedio: ${student.avgScore}%.` : ''} Inscrito el {fmtDate(student.enrolledAt)}.</p>
            <JourneyPath readOnly progress={student.progress} stages={dash.stages.map((st, i, arr) => {
              const req = st.steps.filter((s) => s.required)
              const reqDone = req.filter((s) => student.progress[s.id]?.status === 'completed').length
              const prevDone = arr.slice(0, i).every((p) => p.steps.filter((s) => s.required).every((s) => student.progress[s.id]?.status === 'completed'))
              return { ...st, requiredTotal: req.length, requiredDone: reqDone, complete: st.steps.length > 0 && reqDone === req.length, unlocked: !dash.program.sequential || prevDone }
            })} />
          </div>
        </Modal>
      )}
    </div>
  )
}
