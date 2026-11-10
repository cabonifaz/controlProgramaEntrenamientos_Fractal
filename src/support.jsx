import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Bug, Eye, Lightbulb, MessageSquareWarning, Search, Send } from 'lucide-react'
import { apiBlob, apiRequest, apiUpload } from './api'
import { ErrorNote, EvidencePicker, Modal } from './admin.jsx'

// Incidencias, observaciones y mejoras. "Reportar" (barra superior) toma
// una captura de la pantalla actual ANTES de abrir el formulario, para que
// quien atiende vea exactamente desde donde se registro. En "Soporte" cada
// usuario sigue sus reportes y el admin / super admin los atiende y
// responde.

export const TICKET_TYPES = [
  { key: 'incident', label: 'Incidencia', hint: 'Algo no funciona o da error.', Icon: Bug },
  { key: 'observation', label: 'Observación', hint: 'Algo se ve raro o confunde.', Icon: Eye },
  { key: 'improvement', label: 'Mejora', hint: 'Una idea para que funcione mejor.', Icon: Lightbulb },
]
const TYPE_LABEL = Object.fromEntries(TICKET_TYPES.map((t) => [t.key, t.label]))
const STATUS = [
  { key: 'open', label: 'Abierto' },
  { key: 'in_progress', label: 'En atención' },
  { key: 'resolved', label: 'Resuelto' },
  { key: 'closed', label: 'Cerrado' },
]
const STATUS_LABEL = Object.fromEntries(STATUS.map((s) => [s.key, s.label]))
const DESCRIPTION_MAX = 2000
const when = (dt) => (dt ? new Date(dt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '')

// Captura de la app tal como se ve. Si el navegador no lo permite, el
// reporte sigue sin captura.
// Imagenes que no cargaron (p. ej. un logo borrado) harian fallar toda la
// captura: se omiten y, si aun falla, se reintenta sin incrustar fuentes.
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
async function captureScreen() {
  const { toJpeg } = await import('html-to-image')
  const node = document.querySelector('.app-shell') || document.body
  const options = {
    quality: 0.72,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    backgroundColor: '#f5f7f8',
    width: node.scrollWidth,
    height: Math.min(node.scrollHeight, 6000),
    imagePlaceholder: TRANSPARENT_PIXEL,
    filter: (el) => !(el instanceof HTMLElement && el.dataset?.noCapture !== undefined)
      && !(el instanceof HTMLImageElement && el.complete && el.naturalWidth === 0),
  }
  for (const attempt of [options, { ...options, skipFonts: true }]) {
    try {
      const dataUrl = await toJpeg(node, attempt)
      const blob = await (await fetch(dataUrl)).blob()
      return { blob, url: URL.createObjectURL(blob) }
    } catch (err) {
      console.warn('No se pudo capturar la pantalla', err)
    }
  }
  return null
}

function ReportModal({ session, section, capture, onClose, onSent }) {
  const [type, setType] = useState('incident')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [includeCapture, setIncludeCapture] = useState(Boolean(capture))
  const [image, setImage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('type', type)
      formData.append('title', title.trim())
      formData.append('description', description.trim())
      formData.append('section', section || '')
      formData.append('pageUrl', window.location.pathname)
      formData.append('viewport', `${window.innerWidth}x${window.innerHeight}`)
      if (includeCapture && capture) formData.append('screenshot', capture.blob, 'pantalla.jpg')
      if (image) formData.append('image', image)
      const { data } = await apiUpload('/api/support-tickets', { token: session.token, formData })
      setSent(data.ticket_id)
      onSent?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <Modal title="Reporte enviado" onClose={onClose}>
        <div className="sp-sent">
          <p className="temp-password-box" role="status">Gracias. Tu reporte <b>#{sent}</b> le llegó al equipo que administra la plataforma. Verás la respuesta en <b>Soporte</b> y como alerta.</p>
          <button type="button" className="primary" onClick={onClose}>Listo</button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal title="Reportar incidencia, observación o mejora" onClose={onClose} wide>
      <form className="sp-form" onSubmit={submit}>
        <div className="sp-types" role="radiogroup" aria-label="Tipo de reporte">
          {TICKET_TYPES.map(({ key, label, hint, Icon }) => (
            <button key={key} type="button" role="radio" aria-checked={type === key} className={type === key ? `sp-type on sp-type-${key}` : `sp-type sp-type-${key}`} onClick={() => setType(key)}>
              <Icon size={18} aria-hidden="true" /><strong>{label}</strong><small>{hint}</small>
            </button>
          ))}
        </div>
        <label>Título<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required placeholder="Resume el problema o la idea en una frase" /></label>
        <label>Detalle
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={DESCRIPTION_MAX} required placeholder="¿Qué hiciste, qué esperabas y qué pasó? Para una mejora, ¿qué te ayudaría?" />
          <span className={description.length >= DESCRIPTION_MAX ? 'pf-count limit' : 'pf-count'}>{description.length}/{DESCRIPTION_MAX}</span>
        </label>
        <div className="sp-attachments">
          <div className="sp-capture">
            <span className="evidence-title">Captura de esta pantalla{section ? ` · ${section}` : ''}</span>
            {capture ? (
              <>
                <img src={capture.url} alt={`Captura de la pantalla ${section || ''}`} />
                <label className="checkbox-field sp-include"><input type="checkbox" checked={includeCapture} onChange={(e) => setIncludeCapture(e.target.checked)} /> Adjuntar la captura</label>
              </>
            ) : <p className="muted">No se pudo tomar la captura automática en este navegador. Puedes adjuntar una imagen.</p>}
          </div>
          <EvidencePicker file={image} onChange={setImage} label="Imagen adicional (opcional)" />
        </div>
        <ErrorNote message={error} />
        <div className="st-form-actions">
          <button type="submit" className="primary" disabled={busy || !title.trim() || !description.trim()}><Send size={15} aria-hidden="true" /> {busy ? 'Enviando…' : 'Enviar reporte'}</button>
          <button type="button" className="btn-mini" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}

// Boton de la barra superior: captura y abre el formulario.
export function ReportButton({ session, section }) {
  const [capture, setCapture] = useState(undefined)
  const [busy, setBusy] = useState(false)
  async function open() {
    setBusy(true)
    setCapture(await captureScreen())
    setBusy(false)
  }
  function close() {
    if (capture?.url) URL.revokeObjectURL(capture.url)
    setCapture(undefined)
  }
  return (
    <>
      <button type="button" className="icon-button sp-report-btn" onClick={open} disabled={busy} title="Reportar una incidencia, observación o mejora" data-no-capture>
        <MessageSquareWarning size={19} aria-hidden="true" /><span className="sp-report-label">{busy ? 'Capturando…' : 'Reportar'}</span>
      </button>
      {capture !== undefined && <ReportModal session={session} section={section} capture={capture} onClose={close} />}
    </>
  )
}

// Imagen privada del reporte (captura o adjunto): se trae con el token.
function TicketImage({ token, ticketId, kind, label }) {
  const [url, setUrl] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let objectUrl = ''
    let cancelled = false
    apiBlob(`/api/support-tickets/${ticketId}/file/${kind}`, { token })
      .then((blob) => { if (!cancelled) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) } })
      .catch(() => {})
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [token, ticketId, kind])
  if (!url) return <div className="sp-thumb loading"><span className="muted">Cargando {label.toLowerCase()}…</span></div>
  return (
    <>
      <button type="button" className="sp-thumb" onClick={() => setOpen(true)} aria-label={`Ver ${label.toLowerCase()} en grande`}>
        <img src={url} alt="" /><span>{label}</span>
      </button>
      {open && (
        <Modal title={label} onClose={() => setOpen(false)} full>
          <div className="evidence-view"><img src={url} alt={label} /><a className="btn-mini" href={url} target="_blank" rel="noreferrer">Abrir en otra pestaña</a></div>
        </Modal>
      )}
    </>
  )
}

function TicketDetail({ session, ticketId, canManage, onBack, onChanged }) {
  const { token, profile } = session
  const [ticket, setTicket] = useState(null)
  const [error, setError] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiRequest(`/api/support-tickets/${ticketId}`, { token }).then(({ data }) => setTicket(data)).catch((err) => setError(err.message))
  }, [ticketId, token])
  useEffect(() => { load() }, [load])

  async function send(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiRequest(`/api/support-tickets/${ticketId}/reply`, { method: 'POST', token, body: { message: reply.trim() } })
      setReply('')
      load()
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  async function setStatus(status) {
    setError('')
    try {
      await apiRequest(`/api/support-tickets/${ticketId}/status`, { method: 'POST', token, body: { status } })
      load()
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!ticket) return <div>{error ? <ErrorNote message={error} /> : <p className="muted">Cargando…</p>}</div>
  return (
    <div className="sp-detail">
      <button type="button" className="text-button pg-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Todos los reportes</button>
      <header className="sp-detail-head">
        <div>
          <span className="sp-pills"><span className={`pill sp-t-${ticket.ticket_type}`}>{TYPE_LABEL[ticket.ticket_type]}</span><span className={`pill sp-s-${ticket.status}`}>{STATUS_LABEL[ticket.status]}</span><span className="muted">#{ticket.id}</span></span>
          <h3>{ticket.title}</h3>
          <p className="muted">{ticket.reporter_name} · {ticket.reporter_role_label}{ticket.tenant_name ? ` · ${ticket.tenant_name}` : ''} · {when(ticket.created_at)}</p>
        </div>
        {canManage && (
          <label className="pf-select sp-status-select">Estado
            <select value={ticket.status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
        )}
      </header>
      <p className="sp-description">{ticket.description}</p>
      <dl className="pf-dl sp-meta">
        <div><dt>Pantalla</dt><dd>{ticket.section || '—'}</dd></div>
        <div><dt>Tamaño de pantalla</dt><dd>{ticket.viewport || '—'}</dd></div>
        {canManage && <div><dt>Navegador</dt><dd className="sp-ua">{ticket.user_agent || '—'}</dd></div>}
        {canManage && ticket.reporter_email && <div><dt>Correo</dt><dd>{ticket.reporter_email}</dd></div>}
      </dl>
      {(ticket.has_screenshot || ticket.has_image) && (
        <div className="sp-thumbs">
          {ticket.has_screenshot && <TicketImage token={token} ticketId={ticket.id} kind="screenshot" label="Captura de la pantalla" />}
          {ticket.has_image && <TicketImage token={token} ticketId={ticket.id} kind="image" label="Imagen adjunta" />}
        </div>
      )}
      <section className="sp-thread">
        <h4>Conversación</h4>
        {!ticket.messages.length && <p className="muted">{canManage ? 'Todavía nadie respondió. Tu respuesta le llega como alerta a quien reportó.' : 'Todavía no hay respuesta. Te avisaremos con una alerta.'}</p>}
        <ul>
          {ticket.messages.map((m) => (
            <li key={m.id} className={m.author_id === profile.id ? 'mine' : ''}>
              <span className="sp-author">{m.author_name} <small>{m.author_role_label} · {when(m.created_at)}</small></span>
              <p>{m.message}</p>
            </li>
          ))}
        </ul>
        {ticket.status !== 'closed' && (
          <form className="sp-reply" onSubmit={send}>
            <label className="sr-only" htmlFor="sp-reply">Respuesta</label>
            <textarea id="sp-reply" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={DESCRIPTION_MAX} placeholder={canManage ? 'Responde a quien reportó…' : 'Agrega información…'} />
            <button type="submit" className="primary" disabled={busy || !reply.trim()}><Send size={15} aria-hidden="true" /> {busy ? 'Enviando…' : 'Responder'}</button>
          </form>
        )}
        <ErrorNote message={error} />
      </section>
    </div>
  )
}

export function SupportPanel({ session }) {
  const { token, profile } = session
  const canManage = profile.roleCode === 'tenant_admin' || profile.roleCode === 'super_admin'
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [status, setStatus] = useState(canManage ? 'pending' : '')
  const [type, setType] = useState('')
  const [query, setQuery] = useState('')
  const [reportOpen, setReportOpen] = useState(false)

  const load = useCallback(() => {
    apiRequest('/api/support-tickets', { token }).then(({ data }) => setItems(data)).catch((err) => setError(err.message))
  }, [token])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (items || []).filter((t) => (!type || t.ticket_type === type)
      && (!status || (status === 'pending' ? ['open', 'in_progress'].includes(t.status) : t.status === status))
      && (!q || [t.title, t.description, t.reporter_name, t.section].some((v) => (v || '').toLowerCase().includes(q))))
  }, [items, type, status, query])
  const counts = useMemo(() => Object.fromEntries(STATUS.map((s) => [s.key, (items || []).filter((t) => t.status === s.key).length])), [items])

  if (openId) {
    return <div className="admin-wrap"><section className="panel"><TicketDetail session={session} ticketId={openId} canManage={canManage} onBack={() => { setOpenId(null); load() }} onChanged={load} /></section></div>
  }
  return (
    <div className="admin-wrap">
      <section className="panel">
        <div className="sp-head">
          <div>
            <h3>{canManage ? 'Soporte: reportes de los usuarios' : 'Soporte'}</h3>
            <p className="muted">{canManage ? 'Incidencias, observaciones y mejoras con la captura de la pantalla desde donde se registraron. Responde y cambia su estado.' : 'Tus incidencias, observaciones y mejoras, y las respuestas del equipo. Usa “Reportar” (arriba) desde la pantalla donde está el problema: se adjunta una captura automáticamente.'}</p>
          </div>
          {!canManage && <button type="button" className="primary" onClick={() => setReportOpen(true)}><MessageSquareWarning size={16} aria-hidden="true" /> Nuevo reporte</button>}
        </div>
        {canManage && items && (
          <div className="sp-counts">
            {STATUS.map((s) => <span key={s.key} className={`pill sp-s-${s.key}`}>{s.label} <b>{counts[s.key]}</b></span>)}
          </div>
        )}
        <div className="pf-filters">
          <label className="pf-search"><Search size={15} aria-hidden="true" /><span className="sr-only">Buscar</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por título, detalle, persona o pantalla…" />
          </label>
          <label className="pf-select"><span className="sr-only">Estado</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="pending">Pendientes (abiertos y en atención)</option>
              {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label className="pf-select"><span className="sr-only">Tipo</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Todos los tipos</option>
              {TICKET_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
        </div>
        <ErrorNote message={error} />
        {!items && !error && <p className="muted">Cargando…</p>}
        {items && !filtered.length && <p className="muted">{items.length ? 'Ningún reporte coincide con el filtro.' : canManage ? 'Todavía no hay reportes.' : 'Todavía no enviaste reportes.'}</p>}
        <ul className="sp-list">
          {filtered.map((t) => (
            <li key={t.id}>
              <button type="button" className="sp-item" onClick={() => setOpenId(t.id)}>
                <span className="sp-pills"><span className={`pill sp-t-${t.ticket_type}`}>{TYPE_LABEL[t.ticket_type]}</span><span className={`pill sp-s-${t.status}`}>{STATUS_LABEL[t.status]}</span>{t.has_screenshot ? <span className="muted sp-flag">Con captura</span> : null}</span>
                <strong>{t.title}</strong>
                <span className="muted">{canManage ? `${t.reporter_name} · ${t.reporter_role_label}${t.tenant_name ? ` · ${t.tenant_name}` : ''} · ` : ''}{t.section ? `${t.section} · ` : ''}{when(t.created_at)}</span>
                <span className="sp-replies">{Number(t.replies) ? `${t.replies} respuesta${Number(t.replies) === 1 ? '' : 's'}` : 'Sin respuesta'}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {reportOpen && <ReportModal session={session} section="Soporte" capture={null} onClose={() => setReportOpen(false)} onSent={load} />}
    </div>
  )
}
