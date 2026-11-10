import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { History, Printer, Quote, Sparkles } from 'lucide-react'
import { apiRequest } from './api'
import { ErrorNote } from './admin.jsx'

// Reporte con IA de los comentarios de los alumnos (pestaña de
// Satisfaccion). El servidor anonimiza a los alumnos, llama a OpenAI y
// guarda cada reporte; aqui se eligen los filtros y se muestra el resultado.

const TARGETS = [['', 'Todos los comentarios'], ['topic', 'Sobre temas'], ['component', 'Sobre cursos'], ['instructor', 'Sobre profesores']]
const SENTIMENT = { positivo: { label: 'Positivo', tone: 'ind-advance' }, mixto: { label: 'Mixto', tone: 'ind-same_day' }, negativo: { label: 'Negativo', tone: 'ind-unjustified' } }
const LEVEL = { alta: 'ind-unjustified', media: 'ind-same_day', baja: 'ind-advance' }
const AI_ERRORS = {
  ai_not_configured: 'Falta configurar la clave de OpenAI (OPENAI_API_KEY) en el servidor.',
  ai_failed: 'OpenAI no respondió correctamente. Revisa la clave o el saldo de la cuenta e inténtalo de nuevo.',
  no_comments: 'No hay comentarios con esos filtros.',
}
const day = (dt) => (dt ? new Date(dt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '')
const list = (v) => (Array.isArray(v) ? v : [])

function targetIdOf(f, type) {
  return type === 'topic' ? f.topic_id : type === 'component' ? f.component_id : f.instructor_id
}
function targetNameOf(f, type) {
  return type === 'topic' ? `${f.topic_title} · ${f.component_name}` : type === 'component' ? f.component_name : f.instructor_name
}

export function AiReportView({ report }) {
  const c = report.content || {}
  const sentiment = SENTIMENT[c.sentimiento]
  return (
    <article className="ai-report">
      <header className="ai-report-head">
        <div>
          <span className="pg-stat-label">Reporte con IA</span>
          <h4>{report.title}</h4>
          <p className="muted">{report.comments_count ?? report.commentsCount} comentarios analizados{report.created_at ? ` · ${day(report.created_at)}` : ''}{report.created_by_name ? ` · ${report.created_by_name}` : ''}</p>
        </div>
        <div className="ai-report-score">
          {sentiment && <span className={`ind-pill ${sentiment.tone}`}>{sentiment.label}</span>}
          {c.puntaje_estimado ? <strong>{Number(c.puntaje_estimado).toFixed(1).replace('.', ',')}<small>/5</small></strong> : null}
          <button type="button" className="btn-mini" onClick={() => window.print()}><Printer size={13} aria-hidden="true" /> Imprimir</button>
        </div>
      </header>
      {c.resumen && <p className="ai-summary">{c.resumen}</p>}
      <div className="ai-cols">
        {list(c.fortalezas).length > 0 && (
          <section><h5>Lo que funciona</h5><ul className="ai-bullets ok">{list(c.fortalezas).map((x, i) => <li key={i}>{x}</li>)}</ul></section>
        )}
        {list(c.problemas).length > 0 && (
          <section>
            <h5>Problemas detectados</h5>
            <ul className="ai-cards">
              {list(c.problemas).map((p, i) => (
                <li key={i}><span className={`ind-pill ${LEVEL[p.gravedad] || ''}`}>{p.gravedad || '—'}</span><strong>{p.titulo}</strong><p>{p.detalle}</p>{p.afecta && <small className="muted">Afecta: {p.afecta}</small>}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {list(c.recomendaciones).length > 0 && (
        <section className="ai-block">
          <h5>Recomendaciones</h5>
          <div className="table-fit">
            <table className="admin-table">
              <thead><tr><th>Acción</th><th>Responsable</th><th>Prioridad</th></tr></thead>
              <tbody>{list(c.recomendaciones).map((r, i) => <tr key={i}><td>{r.accion}</td><td>{r.responsable || '—'}</td><td><span className={`ind-pill ${LEVEL[r.prioridad] || ''}`}>{r.prioridad || '—'}</span></td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
      {list(c.por_profesor).length > 0 && (
        <section className="ai-block">
          <h5>Por profesor</h5>
          <ul className="ai-people">
            {list(c.por_profesor).map((p, i) => (
              <li key={i}>
                <strong>{p.profesor}</strong>
                <p>{p.resumen}</p>
                {list(p.fortalezas).length > 0 && <p className="ai-mini ok">+ {list(p.fortalezas).join(' · ')}</p>}
                {list(p.mejoras).length > 0 && <p className="ai-mini warn">→ {list(p.mejoras).join(' · ')}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="ai-cols">
        {list(c.por_curso).length > 0 && (
          <section><h5>Por curso</h5><ul className="ai-bullets">{list(c.por_curso).map((x, i) => <li key={i}><b>{x.curso}:</b> {x.resumen}</li>)}</ul></section>
        )}
        {list(c.temas_a_repetir_o_reforzar).length > 0 && (
          <section><h5>Temas a repetir o reforzar</h5><ul className="ai-bullets">{list(c.temas_a_repetir_o_reforzar).map((x, i) => <li key={i}><b>{x.tema}:</b> {x.motivo}</li>)}</ul></section>
        )}
      </div>
      {list(c.citas).length > 0 && (
        <section className="ai-block">
          <h5>Lo que dicen los alumnos</h5>
          <div className="ai-quotes">{list(c.citas).map((q, i) => <blockquote key={i}><Quote size={14} aria-hidden="true" /> {q.texto}{q.sobre && <cite>{q.sobre}</cite>}</blockquote>)}</div>
        </section>
      )}
      <p className="muted ai-disclaimer">Generado con IA a partir de los comentarios: revísalo antes de tomar decisiones. Los nombres de los alumnos no se enviaron a la IA.</p>
    </article>
  )
}

export function AiReportTab({ token, programId, feedback }) {
  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState([])
  const [targetType, setTargetType] = useState('')
  const [targetId, setTargetId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadHistory = useCallback(() => {
    apiRequest('/api/ai-reports', { token }).then(({ data }) => setHistory(data || [])).catch(() => {})
  }, [token])
  useEffect(() => {
    apiRequest('/api/ai-reports/status', { token }).then(({ data }) => setStatus(data)).catch(() => setStatus({ configured: false }))
    loadHistory()
  }, [token, loadHistory])

  const scoped = useMemo(() => (feedback || []).filter((f) => !programId || String(f.program_id) === programId), [feedback, programId])
  const options = useMemo(() => {
    if (!targetType) return []
    const map = new Map()
    for (const f of scoped) {
      if (f.target_type !== targetType) continue
      const id = targetIdOf(f, targetType)
      if (!map.has(id)) map.set(id, { id, name: targetNameOf(f, targetType), n: 0 })
      map.get(id).n += 1
    }
    return [...map.values()].sort((a, b) => b.n - a.n)
  }, [scoped, targetType])
  const matching = scoped.filter((f) => (!targetType || f.target_type === targetType)
    && (!targetId || String(targetIdOf(f, targetType)) === targetId)
    && (!from || String(f.created_at).slice(0, 10) >= from) && (!to || String(f.created_at).slice(0, 10) <= to)).length

  function describe() {
    const parts = []
    const target = options.find((o) => String(o.id) === targetId)
    parts.push(target ? `${TARGETS.find((t) => t[0] === targetType)[1].replace('Sobre ', '').replace(/s$/, '')} ${target.name}` : TARGETS.find((t) => t[0] === targetType)[1])
    if (from || to) parts.push(`del ${from || 'inicio'} al ${to || 'hoy'}`)
    return parts.join(', ')
  }

  async function generate() {
    setBusy(true)
    setError('')
    setReport(null)
    try {
      const { data } = await apiRequest('/api/ai-reports', {
        method: 'POST', token,
        body: { programId: programId ? Number(programId) : null, targetType: targetType || null, targetId: targetId ? Number(targetId) : null, from: from || null, to: to || null, description: describe() },
      })
      setReport({ ...data, created_at: new Date().toISOString() })
      loadHistory()
    } catch (err) {
      setError(AI_ERRORS[err.message] || err.message)
    } finally {
      setBusy(false)
    }
  }
  async function open(id) {
    setError('')
    try {
      const { data } = await apiRequest(`/api/ai-reports/${id}`, { token })
      setReport(data)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="ai-tab">
      {status && !status.configured && (
        <div className="sch-warn" role="status">
          <Sparkles size={16} aria-hidden="true" />
          <span>Los reportes con IA están listos, pero falta la clave de OpenAI. Agrega la variable <code>OPENAI_API_KEY</code> en Railway (servicio de este ambiente); opcionalmente <code>OPENAI_MODEL</code> (por defecto {status.model || 'gpt-4o-mini'}).</span>
        </div>
      )}
      <div className="admin-form ai-filters">
        <label>Analizar
          <select value={targetType} onChange={(e) => { setTargetType(e.target.value); setTargetId('') }}>
            {TARGETS.map(([k, label]) => <option key={k || 'all'} value={k}>{label}</option>)}
          </select>
        </label>
        {targetType && (
          <label>{targetType === 'topic' ? 'Tema' : targetType === 'component' ? 'Curso' : 'Profesor'}
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Todos</option>
              {options.map((o) => <option key={o.id} value={String(o.id)}>{o.name} ({o.n})</option>)}
            </select>
          </label>
        )}
        <label>Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <div className="sch-actions">
        <button type="button" className="primary ai-generate" onClick={generate} disabled={busy || !matching || !status?.configured}>
          <Sparkles size={16} aria-hidden="true" /> {busy ? 'Analizando comentarios…' : 'Generar reporte con IA'}
        </button>
        <span className="muted">{matching} comentario{matching === 1 ? '' : 's'} con estos filtros</span>
      </div>
      <ErrorNote message={error} />
      {busy && <p className="muted">Esto puede tardar hasta un minuto.</p>}
      {report && <AiReportView report={report} />}
      {history.length > 0 && (
        <section className="ai-history">
          <h5><History size={14} aria-hidden="true" /> Reportes anteriores</h5>
          <ul>
            {history.map((h) => (
              <li key={h.id}><button type="button" className="text-button" onClick={() => open(h.id)}>{h.title}</button><span className="muted"> · {h.comments_count} comentarios · {day(h.created_at)}{h.created_by_name ? ` · ${h.created_by_name}` : ''}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
