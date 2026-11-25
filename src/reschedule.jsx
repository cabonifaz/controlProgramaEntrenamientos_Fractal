import React, { useCallback, useEffect, useState } from 'react'
import { CalendarClock, CalendarCheck2, Check, X } from 'lucide-react'
import { apiRequest } from './api'
import { ErrorNote, Modal } from './admin.jsx'

// Reprogramar una clase que el profesor no puede dictar. El sistema propone
// fechas libres que coinciden con la disponibilidad del profesor. El profesor
// elige y se aplica; el admin la aplica o la envia al profesor para que la
// confirme. Al aplicarse se avisa a los alumnos (correo, app y Slack).

const RESCHEDULE_EVENT = 'class-reschedule-changed'
export const notifyRescheduleChanged = () => window.dispatchEvent(new Event(RESCHEDULE_EVENT))

export function dayLabel(iso) {
  if (!iso) return 'Sin fecha'
  const s = new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const range = (s, e) => (s ? `${s}${e ? `–${e}` : ''}` : 'sin hora')
const isAdminRole = (roleCode) => roleCode === 'tenant_admin' || roleCode === 'super_admin'

export function RescheduleButton({ session, topicId, className = 'btn-mini', label = 'Reprogramar clase', onDone }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><CalendarClock size={15} aria-hidden="true" /> {label}</button>
      {open && <RescheduleDialog session={session} topicId={topicId} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onDone?.() }} />}
    </>
  )
}

export function RescheduleDialog({ session, topicId, onClose, onDone, pendingRequest = null }) {
  const { token, profile } = session
  const isAdmin = isAdminRole(profile.roleCode)
  const [data, setData] = useState(null)
  const [choice, setChoice] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  // Otra fecha y hora escrita a mano
  const [manualOn, setManualOn] = useState(false)
  const [manual, setManual] = useState({ date: '', start: '', end: '' })
  const [check, setCheck] = useState(null) // { issues, warnings } | 'loading'

  useEffect(() => {
    let alive = true
    apiRequest(`/api/topics/${topicId}/reschedule-options`, { token })
      .then((res) => {
        if (!alive) return
        setData(res.data); setChoice(res.data.proposals[0] || null)
        setManual({ date: '', start: res.data.topic.start || '', end: res.data.topic.end || '' })
        if (!res.data.proposals.length) setManualOn(true)
      })
      .catch((err) => { if (alive) setError(err.message) })
    return () => { alive = false }
  }, [topicId, token])

  const manualReady = manualOn && manual.date && manual.start && manual.end
  useEffect(() => {
    if (!manualReady) { setCheck(null); return }
    let alive = true
    setCheck('loading')
    const id = setTimeout(() => {
      apiRequest(`/api/topics/${topicId}/reschedule-check`, { method: 'POST', token, body: manual })
        .then((res) => { if (alive) setCheck(res.data) })
        .catch((err) => { if (alive) setCheck({ issues: [err.message], warnings: [] }) })
    }, 300)
    return () => { alive = false; clearTimeout(id) }
  }, [manualReady, manual.date, manual.start, manual.end, topicId, token]) // eslint-disable-line react-hooks/exhaustive-deps

  // Al cambiar la hora de inicio se conserva la duracion de la clase.
  function setManualStart(start) {
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const dur = manual.start && manual.end ? toMin(manual.end) - toMin(manual.start) : 90
    let end = manual.end
    if (start && dur > 0) { const e = toMin(start) + dur; if (e < 24 * 60) end = `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}` }
    setManual({ ...manual, start, end })
  }

  const selected = manualOn ? (manualReady ? { ...manual } : null) : choice
  const manualBlocked = manualOn && (!manualReady || check === 'loading' || !check || check.issues.length > 0)
  const pending = pendingRequest || data?.pending
  async function submit(mode) {
    if (!selected || manualBlocked) return
    setBusy(mode); setError('')
    const slot = { date: selected.date, start: selected.start, end: selected.end, ...(manualOn ? { custom: true } : {}) }
    try {
      if (pending && !isAdmin) {
        await apiRequest(`/api/class-reschedules/${pending.id}/confirm`, { method: 'POST', token, body: slot })
        setDone({ applied: true, slot })
      } else {
        const res = await apiRequest(`/api/topics/${topicId}/reschedule-request`, { method: 'POST', token, body: { ...slot, reason: reason.trim() || null, mode } })
        setDone({ applied: res.data.applied, slot })
      }
      notifyRescheduleChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const topic = data?.topic
  return (
    <Modal title="Reprogramar clase" onClose={done ? onDone : onClose} wide>
      <div className="rs-wrap">
        {!data && !error && <p className="muted">Buscando fechas libres…</p>}
        <ErrorNote message={error} />
        {done ? (
          <div className="rs-done" role="status">
            <CalendarCheck2 size={28} aria-hidden="true" />
            <div>
              <strong>{done.applied ? 'Listo: la clase cambió de fecha.' : 'Propuesta enviada al profesor.'}</strong>
              <p>{done.applied
                ? `Nueva fecha: ${dayLabel(done.slot.date)}, ${range(done.slot.start, done.slot.end)}. Avisamos a los alumnos por correo y en la app${isAdmin ? ' y al profesor' : ' y al administrador'}.`
                : `Cuando ${topic?.instructorName || 'el profesor'} la confirme, la clase se moverá y se avisará a los alumnos. También puedes confirmarla tú desde la lista de reprogramaciones.`}</p>
              <button type="button" className="primary" onClick={onDone}>Cerrar</button>
            </div>
          </div>
        ) : topic && (
          <>
            <div className="rs-current">
              <span className="rs-label">Clase actual</span>
              <strong>{topic.title}</strong>
              <span>{dayLabel(topic.date)} · {range(topic.start, topic.end)} · {topic.componentName}{topic.instructorName ? ` · ${topic.instructorName}` : ''}</span>
            </div>
            {pending && (
              <p className="rs-pending">
                {pending.requestedRole === 'instructor' ? 'Hay una reprogramación pendiente' : `${pending.requestedByName || 'El administrador'} propone moverla`} al <strong>{dayLabel(pending.newDate)}, {range(pending.newStart, pending.newEnd)}</strong>.
                {isAdmin ? ' Si eliges otra fecha, reemplaza a esa propuesta.' : ' Elige esa u otra fecha y confirma.'}
              </p>
            )}
            {data.availabilitySource === 'schedule' && (
              <p className="rs-note">{topic.instructorName || 'El profesor'} no registró su disponibilidad para este programa: se proponen días y horas como los de su horario actual.</p>
            )}
            {data.proposals.length === 0 ? (
              <p className="rs-empty">No encontramos fechas libres en los próximos 45 días que coincidan con la disponibilidad de {topic.instructorName || 'el profesor'}. Puedes poner una fecha y hora a mano abajo, pedir que actualice su disponibilidad en “Mi disponibilidad” o agregar franjas de clase en Horarios.</p>
            ) : (
              <fieldset className="rs-options">
                <legend>Fechas propuestas <span className="muted">(libres y dentro de {isAdmin ? `la disponibilidad de ${topic.instructorName || 'el profesor'}` : 'tu disponibilidad'})</span></legend>
                {data.proposals.map((p, i) => {
                  const selected = !manualOn && choice && choice.date === p.date && choice.start === p.start
                  const isPending = pending && pending.newDate === p.date && pending.newStart === p.start
                  return (
                    <label key={`${p.date}-${p.start}`} className={`rs-option${selected ? ' is-selected' : ''}`}>
                      <input type="radio" name="rs-slot" checked={Boolean(selected)} onChange={() => { setChoice(p); setManualOn(false) }} />
                      <span className="rs-option-body">
                        <strong>{dayLabel(p.date)}</strong>
                        <span>{range(p.start, p.end)}</span>
                        <span className="rs-tags">
                          {i === 0 && <em className="rs-tag best">La más próxima</em>}
                          {isPending && <em className="rs-tag pend">Propuesta pendiente</em>}
                          {p.dayFree && <em className="rs-tag">Día sin otras clases</em>}
                          {p.sameTime && <em className="rs-tag">Misma hora</em>}
                        </span>
                      </span>
                    </label>
                  )
                })}
                <label className={`rs-option rs-option-manual${manualOn ? ' is-selected' : ''}`}>
                  <input type="radio" name="rs-slot" checked={manualOn} onChange={() => setManualOn(true)} />
                  <span className="rs-option-body"><strong>Otra fecha y hora</strong><span>Escríbela tú</span></span>
                </label>
              </fieldset>
            )}
            {manualOn && (
              <div className="rs-manual">
                <div className="rs-manual-grid">
                  <label>Nueva fecha<input type="date" min={data.today} value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} required /></label>
                  <label>Desde<input type="time" value={manual.start} onChange={(e) => setManualStart(e.target.value)} required /></label>
                  <label>Hasta<input type="time" value={manual.end} onChange={(e) => setManual({ ...manual, end: e.target.value })} required /></label>
                </div>
                {manualReady && check === 'loading' && <p className="muted rs-check">Revisando…</p>}
                {check && check !== 'loading' && check.issues.length > 0 && (
                  <ul className="rs-issues" role="alert">{check.issues.map((t) => <li key={t}>{t}</li>)}</ul>
                )}
                {check && check !== 'loading' && !check.issues.length && (
                  <>
                    {check.warnings.length > 0
                      ? <ul className="rs-warnings" role="status">{check.warnings.map((t) => <li key={t}>{t}</li>)}<li className="rs-warn-note">Puedes confirmarla igual.</li></ul>
                      : <p className="rs-ok" role="status">{dayLabel(manual.date)}, {range(manual.start, manual.end)}: libre y dentro de la disponibilidad.</p>}
                  </>
                )}
              </div>
            )}
            {(data.proposals.length > 0 || manualOn) && !(pending && !isAdmin) && (
              <label className="rs-reason">Motivo (opcional, lo verán los alumnos)
                <textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isAdmin ? 'Ej.: el profesor tiene un viaje de trabajo' : 'Ej.: cita médica'} />
              </label>
            )}
            {(data.proposals.length > 0 || manualOn) && (
              <div className="rs-actions">
                {isAdmin ? (
                  <>
                    <button type="button" className="primary" disabled={!selected || manualBlocked || Boolean(busy)} onClick={() => submit('apply')}>{busy === 'apply' ? 'Cambiando…' : 'Confirmar cambio y avisar'}</button>
                    <button type="button" className="secondary" disabled={!selected || manualBlocked || Boolean(busy)} onClick={() => submit('propose')}>{busy === 'propose' ? 'Enviando…' : 'Enviar al profesor para que confirme'}</button>
                  </>
                ) : (
                  <button type="button" className="primary" disabled={!selected || manualBlocked || Boolean(busy)} onClick={() => submit('apply')}>{busy ? 'Cambiando…' : 'Mover mi clase a esta fecha'}</button>
                )}
              </div>
            )}
            <p className="muted rs-foot">Al confirmar, se avisa a los alumnos por correo, en la app y en el canal de Slack del programa.</p>
          </>
        )}
      </div>
    </Modal>
  )
}

function useReschedules(token) {
  const [items, setItems] = useState(null)
  const load = useCallback(() => {
    apiRequest('/api/class-reschedules', { token }).then((res) => setItems(res.data || [])).catch(() => setItems([]))
  }, [token])
  useEffect(() => {
    load()
    window.addEventListener(RESCHEDULE_EVENT, load)
    const id = setInterval(load, 120000)
    return () => { window.removeEventListener(RESCHEDULE_EVENT, load); clearInterval(id) }
  }, [load])
  return { items, load }
}

// Profesor: propuestas del admin que esperan su confirmacion (en todas las pantallas).
export function PendingReschedulesAlert({ session }) {
  const { token } = session
  const { items, load } = useReschedules(token)
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState('')
  const [choose, setChoose] = useState(null)
  const [flash, setFlash] = useState('')
  const pending = (items || []).filter((r) => r.status === 'pending' && r.requestedRole !== 'instructor')
  if (!pending.length && !flash) return null

  async function act(r, kind) {
    setBusy(r.id); setError(''); setFlash('')
    try {
      await apiRequest(`/api/class-reschedules/${r.id}/${kind}`, { method: 'POST', token, body: {} })
      setFlash(kind === 'confirm' ? `Confirmado: “${r.title}” pasa al ${dayLabel(r.newDate)}, ${range(r.newStart, r.newEnd)}. Avisamos a los alumnos.` : `Rechazaste la propuesta para “${r.title}”. Avisamos al administrador.`)
      notifyRescheduleChanged(); load()
    } catch (err) { setError(err.message) } finally { setBusy(0) }
  }
  return (
    <div className="rs-alerts" data-no-capture>
      {pending.map((r) => (
        <section key={r.id} className="rs-alert" role="alert">
          <div className="rs-alert-head"><CalendarClock size={20} aria-hidden="true" /><h3>Confirma la nueva fecha de tu clase</h3></div>
          <p><strong>{r.title}</strong> · {r.componentName}. {r.requestedByName || 'El administrador'} propone moverla del <s>{dayLabel(r.oldDate)} {r.oldStart || ''}</s> al <strong>{dayLabel(r.newDate)}, {range(r.newStart, r.newEnd)}</strong>.{r.reason ? ` Motivo: ${r.reason}` : ''}</p>
          <div className="rs-alert-actions">
            <button type="button" className="cc-yes" disabled={busy === r.id} onClick={() => act(r, 'confirm')}><Check size={16} aria-hidden="true" />Confirmar esta fecha</button>
            <button type="button" className="secondary" disabled={busy === r.id} onClick={() => setChoose(r)}>Elegir otra fecha</button>
            <button type="button" className="cc-no" disabled={busy === r.id} onClick={() => act(r, 'reject')}><X size={16} aria-hidden="true" />No puedo</button>
          </div>
        </section>
      ))}
      {flash && <p className="cc-flash" role="status">{flash}<button type="button" aria-label="Cerrar" onClick={() => setFlash('')}><X size={15} /></button></p>}
      {error && <p className="cc-error" role="alert">{error}</p>}
      {choose && <RescheduleDialog session={session} topicId={choose.topicId} pendingRequest={choose} onClose={() => setChoose(null)} onDone={() => { setChoose(null); load() }} />}
    </div>
  )
}

const STATUS_LABEL = { pending: 'Pendiente', applied: 'Aplicada', rejected: 'Rechazada por el profesor', withdrawn: 'Retirada' }

// Admin: reprogramaciones pendientes y recientes.
export function ReschedulesAdminPanel({ session }) {
  const { token } = session
  const { items, load } = useReschedules(token)
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState('')
  if (!items || !items.length) return null
  async function act(r, kind) {
    setBusy(r.id); setError('')
    try {
      await apiRequest(`/api/class-reschedules/${r.id}/${kind}`, { method: 'POST', token, body: {} })
      notifyRescheduleChanged(); load()
    } catch (err) { setError(err.message) } finally { setBusy(0) }
  }
  const pending = items.filter((r) => r.status === 'pending')
  return (
    <section className="panel rs-admin">
      <h3>Reprogramaciones de clases {pending.length > 0 && <span className="rs-count">{pending.length} pendiente{pending.length === 1 ? '' : 's'}</span>}</h3>
      <ErrorNote message={error} />
      <ul className="rs-admin-list">
        {items.slice(0, 12).map((r) => (
          <li key={r.id} className={`rs-admin-row st-${r.status}`}>
            <div className="rs-admin-info">
              <strong>{r.title}</strong>
              <span>{r.componentName} · {r.instructorName || 'Sin profesor'}</span>
              <span><s>{dayLabel(r.oldDate)} {r.oldStart || ''}</s> → <b>{dayLabel(r.newDate)}, {range(r.newStart, r.newEnd)}</b></span>
              <span className="muted">{r.requestedRole === 'instructor' ? `Pedido por ${r.requestedByName}` : `Propuesto por ${r.requestedByName || 'admin'}`}{r.reason ? ` · ${r.reason}` : ''}</span>
            </div>
            <div className="rs-admin-actions">
              <span className={`rs-status st-${r.status}`}>{r.status === 'pending' ? 'Esperando al profesor' : STATUS_LABEL[r.status] || r.status}</span>
              {r.status === 'pending' && (
                <>
                  <button type="button" className="btn-mini" disabled={busy === r.id} onClick={() => act(r, 'confirm')}>Confirmar yo</button>
                  <button type="button" className="btn-mini" disabled={busy === r.id} onClick={() => act(r, 'reject')}>Retirar</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
