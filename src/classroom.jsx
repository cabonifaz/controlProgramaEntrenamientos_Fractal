import React, { useCallback, useEffect, useState } from 'react'
import { Clapperboard, Download, ExternalLink, FileText, Link2, Pencil, Trash2, Upload, Video } from 'lucide-react'
import { apiDownload, apiRequest, apiUpload } from './api'
import { ErrorNote } from './admin.jsx'
import { classWhen } from './progress.jsx'

// Clase en linea: unirse a la reunion (Teams/Meet/Zoom), ver la grabacion,
// la nota del profesor y descargar los materiales. El profesor del grupo y
// el admin editan; los alumnos solo ven.

export const CLASS_UPDATED_EVENT = 'class-updated'
const PROVIDER = { teams: 'Microsoft Teams', meet: 'Google Meet', zoom: 'Zoom', other: 'la reunión' }
const sizeText = (b) => (!b ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
export const providerOf = (url) => {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    if (host.endsWith('teams.microsoft.com') || host.endsWith('teams.live.com')) return 'teams'
    if (host === 'meet.google.com') return 'meet'
    if (host === 'zoom.us' || host.endsWith('.zoom.us')) return 'zoom'
  } catch { /* link invalido */ }
  return 'other'
}

export function JoinButton({ url, compact = false }) {
  if (!url) return null
  const provider = PROVIDER[providerOf(url)]
  return (
    <a className={compact ? 'cl-join compact' : 'cl-join'} href={url} target="_blank" rel="noreferrer">
      <Video size={compact ? 15 : 18} aria-hidden="true" /> {compact ? 'Unirse' : `Unirse por ${provider}`}
    </a>
  )
}

function EditForm({ token, topicId, data, onSaved, onCancel }) {
  const [form, setForm] = useState({
    meetingUrl: data.ownMeetingUrl || data.groupMeetingUrl || '', applyToGroup: !data.ownMeetingUrl && Boolean(data.groupMeetingUrl),
    recordingUrl: data.recordingUrl || '', classNotes: data.classNotes || '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiRequest(`/api/topics/${topicId}/class`, { method: 'PUT', token, body: form })
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="cl-form" onSubmit={save}>
      <label>Link de la reunión (Teams, Meet o Zoom)
        <input type="url" value={form.meetingUrl} onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })} placeholder="https://teams.microsoft.com/l/meetup-join/…" />
      </label>
      <label className="checkbox-field cl-check"><input type="checkbox" checked={form.applyToGroup} onChange={(e) => setForm({ ...form, applyToGroup: e.target.checked })} /> Usar este link para todas las clases de {data.groupName || 'este grupo'} (reunión recurrente)</label>
      <label>Link de la grabación
        <input type="url" value={form.recordingUrl} onChange={(e) => setForm({ ...form, recordingUrl: e.target.value })} placeholder="https://… (Stream, Drive, YouTube…)" />
      </label>
      <label>Nota para los alumnos
        <textarea value={form.classNotes} onChange={(e) => setForm({ ...form, classNotes: e.target.value })} maxLength={2000} placeholder="Qué preparar, tarea, aclaraciones…" />
        <span className="pf-count">{form.classNotes.length}/2000</span>
      </label>
      <ErrorNote message={error} />
      <div className="st-form-actions">
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn-mini" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

function AddResource({ token, topicId, onAdded }) {
  const [mode, setMode] = useState('file')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function add(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'file') {
        const formData = new FormData()
        formData.append('title', title.trim())
        formData.append('file', file)
        await apiUpload(`/api/topics/${topicId}/resources`, { token, formData })
      } else {
        await apiRequest(`/api/topics/${topicId}/resources`, { method: 'POST', token, body: { title: title.trim(), url: url.trim() } })
      }
      setTitle(''); setUrl(''); setFile(null)
      onAdded()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="cl-add" onSubmit={add}>
      <div className="cl-add-modes" role="radiogroup" aria-label="Tipo de material">
        <button type="button" role="radio" aria-checked={mode === 'file'} className={mode === 'file' ? 'tab-button active' : 'tab-button'} onClick={() => setMode('file')}><Upload size={13} aria-hidden="true" /> Archivo</button>
        <button type="button" role="radio" aria-checked={mode === 'link'} className={mode === 'link' ? 'tab-button active' : 'tab-button'} onClick={() => setMode('link')}><Link2 size={13} aria-hidden="true" /> Link</button>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={mode === 'file' ? 'Título (opcional: usa el nombre del archivo)' : 'Título del link'} required={mode === 'link'} aria-label="Título del material" />
      {mode === 'file'
        ? <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} required aria-label="Archivo" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.zip,.png,.jpg,.jpeg,.webp,.gif,.json,.sql,.js,.ts,.html,.css,.py,.java,.cs" />
        : <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" required aria-label="Link" />}
      <button type="submit" className="primary btn-compact" disabled={busy || (mode === 'file' ? !file : !url.trim() || !title.trim())}>{busy ? 'Subiendo…' : 'Agregar'}</button>
      <small className="muted">Archivos de hasta 25 MB: PDF, Office, imágenes, ZIP, código.</small>
      <ErrorNote message={error} />
    </form>
  )
}

export function ClassroomPanel({ session, topic, onChanged }) {
  const { token } = session
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const load = useCallback(() => {
    apiRequest(`/api/topics/${topic.id}/class`, { token }).then(({ data }) => setData(data)).catch((err) => setError(err.message))
  }, [token, topic.id])
  useEffect(() => { load() }, [load])
  const changed = () => { load(); onChanged?.(); window.dispatchEvent(new Event(CLASS_UPDATED_EVENT)) }

  async function remove(r) {
    if (!window.confirm(`¿Quitar “${r.title}”?`)) return
    try {
      await apiRequest(`/api/topics/${topic.id}/resources/${r.id}`, { method: 'DELETE', token })
      changed()
    } catch (err) {
      setError(err.message)
    }
  }
  async function download(r) {
    try {
      await apiDownload(`/api/topics/${topic.id}/resources/${r.id}/download`, { token, filename: r.originalName || r.title })
    } catch (err) {
      setError(err.message)
    }
  }

  if (!data) return <section className="cl-panel"><ErrorNote message={error} />{!error && <p className="muted">Cargando la clase…</p>}</section>
  return (
    <section className="cl-panel">
      <div className="cl-head">
        <h4><Video size={16} aria-hidden="true" /> Clase en línea</h4>
        {data.canEdit && !editing && <button type="button" className="btn-mini" onClick={() => setEditing(true)}><Pencil size={13} aria-hidden="true" /> Editar links y nota</button>}
      </div>
      {editing ? <EditForm token={token} topicId={topic.id} data={data} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); changed() }} /> : (
        <>
          <div className="cl-links">
            {data.meetingUrl ? <JoinButton url={data.meetingUrl} /> : <span className="muted cl-missing">{data.canEdit ? 'Todavía no hay link de la reunión. Agrégalo con “Editar links y nota”.' : 'El profesor todavía no publicó el link de la reunión.'}</span>}
            {data.recordingUrl && <a className="cl-recording" href={data.recordingUrl} target="_blank" rel="noreferrer"><Clapperboard size={16} aria-hidden="true" /> Ver la grabación</a>}
          </div>
          {data.meetingUrl && !data.ownMeetingUrl && data.groupMeetingUrl && <small className="muted">Link de la reunión del grupo (el mismo para todas sus clases).</small>}
          {data.classNotes && <p className="cl-notes">{data.classNotes}</p>}
        </>
      )}
      <div className="cl-resources">
        <h5>Materiales de la clase</h5>
        {!data.resources.length && <p className="muted">{data.canEdit ? 'Sube archivos o agrega links para tus alumnos.' : 'Todavía no hay materiales para esta clase.'}</p>}
        <ul>
          {data.resources.map((r) => (
            <li key={r.id}>
              {r.kind === 'file' ? <FileText size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
              <div><strong>{r.title}</strong><small className="muted">{r.kind === 'file' ? `${r.originalName} · ${sizeText(r.sizeBytes)}` : r.url}</small></div>
              {r.kind === 'file'
                ? <button type="button" className="btn-mini" onClick={() => download(r)}><Download size={13} aria-hidden="true" /> Descargar</button>
                : <a className="btn-mini" href={r.url} target="_blank" rel="noreferrer"><ExternalLink size={13} aria-hidden="true" /> Abrir</a>}
              {data.canEdit && <button type="button" className="cl-remove" onClick={() => remove(r)} aria-label={`Quitar ${r.title}`}><Trash2 size={14} aria-hidden="true" /></button>}
            </li>
          ))}
        </ul>
        {data.canEdit && <AddResource token={token} topicId={topic.id} onAdded={changed} />}
      </div>
      <ErrorNote message={error} />
    </section>
  )
}

// ===================================================================
// Aviso de la proxima clase (alumno y profesor), arriba en todas las
// pantallas: cuando es, que tema y el boton para unirse.
export function NextClassBar({ session, refreshKey }) {
  const { token } = session
  const [next, setNext] = useState(undefined)
  useEffect(() => {
    let cancelled = false
    const load = () => apiRequest('/api/progress', { token }).then(({ data }) => {
      if (cancelled) return
      const topics = data.components.flatMap((c) => c.groups.flatMap((g) => g.topics.map((t) => ({ ...t, componentName: c.name, groupName: g.name }))))
        .filter((t) => t.scheduledOn && t.scheduledOn >= data.today && t.column !== 'completed')
        .sort((a, b) => (a.scheduledOn + (a.startTime || '')).localeCompare(b.scheduledOn + (b.startTime || '')))
      setNext(topics[0] ? { ...topics[0], today: data.today } : null)
    }).catch(() => { if (!cancelled) setNext(null) })
    load()
    const timer = setInterval(load, 5 * 60 * 1000)
    window.addEventListener(CLASS_UPDATED_EVENT, load)
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener(CLASS_UPDATED_EVENT, load) }
  }, [token, refreshKey])
  if (!next) return null
  const isToday = next.scheduledOn === next.today
  return (
    <div className={isToday ? 'cl-nextbar today' : 'cl-nextbar'} role="status" data-no-capture>
      <span className="cl-nextbar-when"><Video size={15} aria-hidden="true" /> {isToday ? 'Clase de hoy' : 'Próxima clase'}: <b>{classWhen(next, next.today)}</b></span>
      <span className="cl-nextbar-topic">{next.componentName} — {next.title}</span>
      {next.meetingUrl ? <JoinButton url={next.meetingUrl} compact /> : <span className="cl-nextbar-pending">Link pendiente</span>}
    </div>
  )
}
