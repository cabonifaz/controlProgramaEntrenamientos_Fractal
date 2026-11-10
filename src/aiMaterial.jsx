import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Sparkles, XCircle } from 'lucide-react'
import { apiRequest } from './api'
import { ErrorNote } from './admin.jsx'

// Generacion automatica del material de un componente con IA (sin subir
// archivos). Crea un trabajo asincrono en el servidor y muestra su avance
// tema por tema; al terminar llega una alerta y aparece el check.

export const MATERIAL_JOB_EVENT = 'material-job-changed'
const LEVELS = ['Básico', 'Intermedio', 'Avanzado']
const ACTIVE = new Set(['queued', 'running'])
const STATUS_TEXT = { queued: 'En cola', running: 'Generando…', done: 'Material listo', partial: 'Listo con errores', failed: 'No se pudo generar', interrupted: 'Interrumpido' }

function TopicChip({ t }) {
  const icon = t.status === 'done' ? <CheckCircle2 size={14} aria-hidden="true" />
    : t.status === 'failed' ? <XCircle size={14} aria-hidden="true" />
      : t.status === 'running' ? <Loader2 size={14} className="ai-spin" aria-hidden="true" /> : null
  const tip = t.status === 'failed' ? `Error: ${t.errors.join('; ')}` : t.status === 'done' ? 'Publicado' : t.status === 'running' ? 'Generando' : 'En espera'
  return <li className={`ai-chip ${t.status}`} title={tip}>{icon}<span>{String(t.numero).padStart(2, '0')} · {t.titulo}</span></li>
}

export function JobProgress({ job, onRetry }) {
  const pct = job.total ? Math.round((100 * (job.done + job.failed)) / job.total) : 0
  const active = ACTIVE.has(job.status)
  return (
    <div className={`ai-job ${job.status}`}>
      <div className="ai-job-head">
        {job.status === 'done' && <CheckCircle2 size={22} className="ai-job-icon ok" aria-hidden="true" />}
        {(job.status === 'partial' || job.status === 'interrupted') && <AlertTriangle size={22} className="ai-job-icon warn" aria-hidden="true" />}
        {job.status === 'failed' && <XCircle size={22} className="ai-job-icon bad" aria-hidden="true" />}
        {active && <Loader2 size={22} className="ai-job-icon ai-spin" aria-hidden="true" />}
        <div>
          <strong>{STATUS_TEXT[job.status]}</strong>
          <span className="muted">{job.done} de {job.total} tema(s) publicados{job.failed ? ` · ${job.failed} con error` : ''}{job.createdByName ? ` · pedido por ${job.createdByName}` : ''}</span>
        </div>
        {!active && job.failed > 0 && onRetry && <button type="button" className="btn-mini" onClick={() => onRetry(job)}><RotateCcw size={13} aria-hidden="true" /> Reintentar los fallidos</button>}
      </div>
      <div className="ai-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la generación"><span style={{ width: `${pct}%` }} /></div>
      {job.error && <p className="form-error">{job.error}</p>}
      <ul className="ai-chips">{job.topics.map((t) => <TopicChip key={t.numero} t={t} />)}</ul>
    </div>
  )
}

export function AiMaterialGenerator({ session, componentId, material, onPublished }) {
  const { token } = session
  const [status, setStatus] = useState(null)
  const [topics, setTopics] = useState([])
  const [jobs, setJobs] = useState([])
  const [scope, setScope] = useState('all')
  const [selected, setSelected] = useState([])
  const [options, setOptions] = useState({ audience: '', level: 'Intermedio', sector: '', extra: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lastDone = useRef(null)

  const loadJobs = useCallback(() => apiRequest(`/api/components/${componentId}/material/ai-jobs`, { token }).then(({ data }) => setJobs(data)).catch(() => {}), [componentId, token])
  useEffect(() => {
    apiRequest('/api/material-jobs/status', { token }).then(({ data }) => setStatus(data)).catch(() => setStatus({ configured: false }))
    apiRequest(`/api/components/${componentId}/material-prompt`, { token }).then(({ data }) => setTopics(data.topics || [])).catch(() => {})
    loadJobs()
  }, [componentId, token, loadJobs])

  const current = jobs[0]
  const running = current && ACTIVE.has(current.status)
  // Mientras hay un trabajo en curso se consulta su avance.
  useEffect(() => {
    if (!running) return undefined
    const timer = setInterval(loadJobs, 4000)
    return () => clearInterval(timer)
  }, [running, loadJobs])
  // Cada tema publicado actualiza el material de arriba.
  useEffect(() => {
    const doneNow = current ? `${current.id}:${current.done}` : null
    if (current && lastDone.current && doneNow !== lastDone.current && current.done > 0) onPublished?.()
    lastDone.current = doneNow
    if (current && !ACTIVE.has(current.status)) window.dispatchEvent(new Event(MATERIAL_JOB_EVENT))
  }, [current, onPublished])

  const isZip = material && !/generado con ia/i.test(material.originalName || '')
  const count = scope === 'all' ? topics.length : selected.length

  async function start(topicNumbers) {
    if (isZip && !window.confirm('Este componente tiene material subido como ZIP. El material generado con IA lo reemplaza: solo quedarán los temas que se generen. ¿Continuar?')) return
    setBusy(true)
    setError('')
    try {
      await apiRequest(`/api/components/${componentId}/material/ai-jobs`, { method: 'POST', token, body: { topicNumbers, options } })
      await loadJobs()
      window.dispatchEvent(new Event(MATERIAL_JOB_EVENT))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const toggle = (n) => setSelected((list) => (list.includes(n) ? list.filter((x) => x !== n) : [...list, n].sort((a, b) => a - b)))

  if (status && !status.configured) {
    return <div className="sch-warn" role="status"><Sparkles size={16} aria-hidden="true" /><span>La generación automática necesita la clave de OpenAI (<code>OPENAI_API_KEY</code>) configurada en el servidor.</span></div>
  }
  return (
    <section className="ai-gen">
      <div className="ai-gen-head">
        <h4><Sparkles size={17} aria-hidden="true" /> Generar automáticamente con IA</h4>
        <p className="muted">La IA escribe el material de cada tema (explicación, ejemplos, ejercicios con soluciones, preguntas y guía docente) y se publica con la marca de tu organización. Corre en segundo plano: puedes seguir trabajando y te llegará una alerta al terminar.</p>
      </div>
      {current && <JobProgress job={current} onRetry={(job) => start(job.topics.filter((t) => t.status === 'failed').map((t) => t.numero))} />}
      {!running && (
        <>
          <div className="admin-form ai-gen-form">
            <label>Perfil de los alumnos<input value={options.audience} onChange={(e) => setOptions({ ...options, audience: e.target.value })} maxLength={300} placeholder="Ej.: egresados de ingeniería sin experiencia laboral" /></label>
            <label>Nivel<select value={options.level} onChange={(e) => setOptions({ ...options, level: e.target.value })}>{LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
            <label>Ambientar en (opcional)<input value={options.sector} onChange={(e) => setOptions({ ...options, sector: e.target.value })} maxLength={200} placeholder="Ej.: banca, retail, salud" /></label>
            <label className="full-field">Indicaciones adicionales (opcional)<textarea value={options.extra} onChange={(e) => setOptions({ ...options, extra: e.target.value })} maxLength={1000} placeholder="Ej.: usar .NET 8 y SQL Server; ejemplos con casos peruanos" /></label>
          </div>
          <fieldset className="ai-scope">
            <legend>¿Qué temas?</legend>
            <label className="checkbox-field"><input type="radio" name={`scope-${componentId}`} checked={scope === 'all'} onChange={() => setScope('all')} /> Todo el componente ({topics.length} temas)</label>
            <label className="checkbox-field"><input type="radio" name={`scope-${componentId}`} checked={scope === 'some'} onChange={() => setScope('some')} /> Elegir temas</label>
          </fieldset>
          {scope === 'some' && (
            <ul className="ai-topic-pick">
              {topics.map((t) => (
                <li key={t.position}><label className="checkbox-field"><input type="checkbox" checked={selected.includes(t.position)} onChange={() => toggle(t.position)} /> {String(t.position).padStart(2, '0')} · {t.title}</label></li>
              ))}
            </ul>
          )}
          {isZip && <p className="sch-warn"><AlertTriangle size={16} aria-hidden="true" /> El material actual es un ZIP subido: al generar con IA se reemplaza por los temas generados.</p>}
          <ErrorNote message={error} />
          <div className="sch-actions">
            <button type="button" className="primary ai-gen-btn" onClick={() => start(scope === 'all' ? null : selected)} disabled={busy || !count}>
              <Sparkles size={16} aria-hidden="true" /> {busy ? 'Creando…' : `Generar ${count} tema${count === 1 ? '' : 's'}`}
            </button>
            <small className="muted">Unos 15–30 s por tema, hasta 3 a la vez.</small>
          </div>
        </>
      )}
      {jobs.length > 1 && (
        <details className="ai-history">
          <summary>Generaciones anteriores</summary>
          <ul>{jobs.slice(1).map((j) => <li key={j.id}><span className={`ai-dot ${j.status}`} aria-hidden="true" />{STATUS_TEXT[j.status]} · {j.done}/{j.total} temas · {new Date(j.createdAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}{j.createdByName ? ` · ${j.createdByName}` : ''}</li>)}</ul>
        </details>
      )}
    </section>
  )
}

// ===================================================================
// Indicador en la barra superior (admins): generaciones en curso y las que
// terminaron hace poco, con su check.
export function MaterialJobsIndicator({ session, onFinished }) {
  const { token } = session
  const [jobs, setJobs] = useState([])
  const [open, setOpen] = useState(false)
  const known = useRef(new Map())
  const load = useCallback(() => apiRequest('/api/material-jobs/recent', { token }).then(({ data }) => {
    for (const j of data) {
      const before = known.current.get(j.id)
      if (before && ACTIVE.has(before) && !ACTIVE.has(j.status)) onFinished?.(j)
      known.current.set(j.id, j.status)
    }
    setJobs(data)
  }).catch(() => {}), [token, onFinished])
  const active = jobs.some((j) => ACTIVE.has(j.status))
  useEffect(() => {
    load()
    const timer = setInterval(load, active ? 5000 : 30000)
    window.addEventListener(MATERIAL_JOB_EVENT, load)
    return () => { clearInterval(timer); window.removeEventListener(MATERIAL_JOB_EVENT, load) }
  }, [load, active])
  if (!jobs.length) return null
  const running = jobs.filter((j) => ACTIVE.has(j.status))
  const latest = jobs[0]
  const label = running.length
    ? `Generando material ${running.reduce((n, j) => n + j.done, 0)}/${running.reduce((n, j) => n + j.total, 0)}`
    : latest.status === 'done' ? 'Material listo' : STATUS_TEXT[latest.status]
  const tone = running.length ? 'running' : latest.status === 'done' ? 'ok' : 'warn'
  return (
    <div className="ai-indicator" data-no-capture>
      <button type="button" className={`ai-indicator-btn ${tone}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} title="Generación de material con IA">
        {running.length ? <Loader2 size={15} className="ai-spin" aria-hidden="true" /> : tone === 'ok' ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
        <span className="ai-indicator-label">{label}</span>
      </button>
      {open && (
        <div className="ai-indicator-pop" role="dialog" aria-label="Generaciones de material">
          <ul>
            {jobs.map((j) => (
              <li key={j.id}>
                <span className={`ai-dot ${j.status}`} aria-hidden="true" />
                <div><strong>{j.componentName}</strong><small className="muted">{STATUS_TEXT[j.status]} · {j.done}/{j.total} temas{j.failed ? ` · ${j.failed} con error` : ''}</small></div>
              </li>
            ))}
          </ul>
          <small className="muted">El detalle está en Programas → componente → Material.</small>
        </div>
      )}
    </div>
  )
}
