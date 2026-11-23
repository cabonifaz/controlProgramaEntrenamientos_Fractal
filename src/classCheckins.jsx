import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, BellRing, CheckCircle2, Clock, Radio, X } from 'lucide-react'
import { apiRequest } from './api'
import { JoinButton } from './classroom.jsx'

// Avisos llamativos para que el profesor marque si dicto cada tema:
//  - durante la clase (barra "En vivo" y aviso al empezar),
//  - al terminarla (ventana "¿Completaste el tema?"),
//  - al empezar la siguiente o al entrar, si quedaron temas sin marcar.
// Marcar el tema como dictado reporta automaticamente sus horas trabajadas.

const POLL_MS = 60 * 1000
const SNOOZE_MS = 30 * 60 * 1000
const HOURS_NOTE = 'Al marcar un tema como dictado, tus horas trabajadas se reportan automáticamente. Si no lo marcas, esas horas no se cuentan.'

const store = {
  get: (k) => { try { return window.localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { window.localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } },
}

function dayLabel(iso, today) {
  if (iso === today) return 'Hoy'
  const diff = Math.round((new Date(`${today}T12:00:00Z`) - new Date(`${iso}T12:00:00Z`)) / 86400000)
  if (diff === 1) return 'Ayer'
  const label = new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PE', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
const timeRange = (t) => (t.start ? `${t.start}${t.end ? `–${t.end}` : ''}` : 'sin hora')

function CheckinRow({ item, today, busy, onMark, compact = false, delayed = false }) {
  return (
    <li className={`cc-row${delayed ? ' is-delayed' : ''}`}>
      <div className="cc-row-info">
        <strong>{item.title}</strong>
        <span>{dayLabel(item.date, today)} · {timeRange(item)} · {item.componentName}{compact ? '' : ` · ${item.programName}`}</span>
        {delayed && <span className="cc-row-tag">Lo marcaste como atrasado: márcalo como dictado cuando lo termines.</span>}
      </div>
      <div className="cc-row-actions">
        <button type="button" className="cc-yes" disabled={busy} onClick={() => onMark(item, true)}><CheckCircle2 size={16} aria-hidden="true" />{delayed ? 'Ya lo completé' : 'Sí, lo dicté'}</button>
        {!delayed && <button type="button" className="cc-no" disabled={busy} onClick={() => onMark(item, false)}>No, quedó atrasado</button>}
      </div>
    </li>
  )
}

export function ClassCheckinAlerts({ session, refreshKey }) {
  const { token, profile } = session
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [modal, setModal] = useState(null) // { moment: 'start'|'end'|'pending', items }
  const firstButton = useRef(null)
  const key = (s) => `cc:${profile.id ?? profile.email}:${s}`

  const load = useCallback(() => {
    apiRequest('/api/me/class-checkins', { token }).then((res) => setData(res.data || null)).catch(() => {})
  }, [token])
  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => {
    const id = setInterval(load, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  // Que ventana mostrar segun el momento (una vez por clase y momento).
  useEffect(() => {
    if (!data || modal) return
    const justEnded = data.pending.filter((t) => t.minutesSinceEnd !== null && t.minutesSinceEnd !== undefined && !store.get(key(`end:${t.topicId}:${t.date}`)))
    if (justEnded.length) {
      justEnded.forEach((t) => store.set(key(`end:${t.topicId}:${t.date}`), '1'))
      setModal({ moment: 'end' })
      return
    }
    const started = data.live.filter((t) => !store.get(key(`start:${t.topicId}:${t.date}`)))
    if (started.length) {
      started.forEach((t) => store.set(key(`start:${t.topicId}:${t.date}`), '1'))
      setModal({ moment: 'start' })
      return
    }
    if (data.pending.length && Number(store.get(key('snooze')) || 0) < Date.now()) setModal({ moment: 'pending' })
  }, [data, modal]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (modal) setTimeout(() => firstButton.current?.focus(), 30) }, [modal])

  const closeModal = useCallback(() => {
    store.set(key('snooze'), String(Date.now() + SNOOZE_MS))
    setModal(null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!modal) return
    const onKey = (e) => { if (e.key === 'Escape') closeModal() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal, closeModal])

  async function mark(item, done) {
    setBusy(true); setError(''); setFlash('')
    try {
      const res = await apiRequest(`/api/me/class-checkins/${item.topicId}`, { method: 'POST', token, body: { done } })
      setData(res.data)
      setFlash(done ? `Listo: “${item.title}” quedó como dictado y tus horas se reportaron.` : `Anotado: “${item.title}” quedó atrasado. Márcalo como dictado cuando lo termines.`)
      if (modal && !res.data.pending.length && !(modal.moment === 'start' && res.data.live.length)) setModal(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!data) return null
  const { live, pending, delayed, today } = data
  if (!live.length && !pending.length && !delayed.length && !flash) return null

  const endedToday = pending.filter((t) => t.minutesSinceEnd !== null && t.minutesSinceEnd !== undefined)
  const modalTitle = modal?.moment === 'end'
    ? (endedToday.length === 1 ? `Terminó tu clase: ¿completaste “${endedToday[0].title}”?` : 'Terminó tu clase: ¿completaste los temas?')
    : modal?.moment === 'start'
      ? `¡Empezó tu clase${live[0] ? `: ${live[0].title}` : ''}!`
      : `Te falta marcar ${pending.length} tema${pending.length === 1 ? '' : 's'} como dictado${pending.length === 1 ? '' : 's'}`

  return (
    <>
      <div className="cc-stack" data-no-capture>
        {live.map((t) => (
          <section key={t.topicId} className="cc-alert cc-live" role="region" aria-label="Clase en curso">
            <div className="cc-head">
              <span className="cc-live-dot" aria-hidden="true" /><span className="cc-kicker">En vivo · {timeRange(t)}{t.minutesLeft > 0 ? ` · quedan ${t.minutesLeft} min` : ''}</span>
            </div>
            <h3>Estás dictando: {t.title}</h3>
            <p>Cuando termines, marca si completaste el tema. <strong>Así se reportan tus horas trabajadas automáticamente.</strong></p>
            <div className="cc-actions">
              <button type="button" className="cc-yes" disabled={busy} onClick={() => mark(t, true)}><CheckCircle2 size={16} aria-hidden="true" />Sí, lo completé</button>
              <button type="button" className="cc-no" disabled={busy} onClick={() => mark(t, false)}>No, quedó atrasado</button>
              {t.meetingUrl && <JoinButton url={t.meetingUrl} compact />}
            </div>
          </section>
        ))}
        {pending.length > 0 && (
          <section className="cc-alert cc-pending" role="alert">
            <div className="cc-head">
              <AlertTriangle size={22} aria-hidden="true" />
              <h3>Te falta marcar {pending.length} tema{pending.length === 1 ? '' : 's'} como dictado{pending.length === 1 ? '' : 's'}</h3>
            </div>
            <p className="cc-hours"><Clock size={15} aria-hidden="true" />{HOURS_NOTE}</p>
            <ul className="cc-list">{pending.map((t) => <CheckinRow key={t.topicId} item={t} today={today} busy={busy} onMark={mark} />)}</ul>
          </section>
        )}
        {delayed.length > 0 && (
          <section className="cc-alert cc-delayed" role="region" aria-label="Temas atrasados">
            <div className="cc-head"><BellRing size={18} aria-hidden="true" /><h3>{delayed.length} tema{delayed.length === 1 ? '' : 's'} atrasado{delayed.length === 1 ? '' : 's'} por completar</h3></div>
            <ul className="cc-list">{delayed.map((t) => <CheckinRow key={t.topicId} item={t} today={today} busy={busy} onMark={mark} delayed />)}</ul>
          </section>
        )}
        {flash && <p className="cc-flash" role="status"><CheckCircle2 size={16} aria-hidden="true" />{flash}<button type="button" aria-label="Cerrar" onClick={() => setFlash('')}><X size={15} /></button></p>}
        {error && !modal && <p className="cc-error" role="alert">{error}</p>}
      </div>

      {modal && (
        <div className="cc-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal() }}>
          <div className={`cc-modal cc-modal-${modal.moment}`} role="alertdialog" aria-modal="true" aria-labelledby="cc-modal-title" aria-describedby="cc-modal-desc">
            <button type="button" className="cc-close" aria-label="Recordármelo más tarde" onClick={closeModal}><X size={18} /></button>
            <div className="cc-modal-icon" aria-hidden="true">{modal.moment === 'start' ? <Radio size={30} /> : <AlertTriangle size={30} />}</div>
            <h2 id="cc-modal-title">{modalTitle}</h2>
            <p id="cc-modal-desc" className="cc-modal-desc">
              {modal.moment === 'start'
                ? <>Al terminar la clase, marca si completaste el tema. <strong>Con eso se reportan automáticamente tus horas trabajadas.</strong></>
                : <><strong>Marcar el tema como dictado reporta automáticamente tus horas trabajadas.</strong> Si no lo marcas, esas horas no se cuentan.</>}
            </p>
            {modal.moment === 'start' && live[0] && (
              <div className="cc-modal-live">
                <span>{timeRange(live[0])} · {live[0].componentName}</span>
                {live[0].meetingUrl && <JoinButton url={live[0].meetingUrl} compact />}
              </div>
            )}
            {pending.length > 0 && (
              <>
                {modal.moment === 'start' && <p className="cc-modal-sub">Antes de seguir, te falta marcar:</p>}
                <ul className="cc-list">{pending.map((t) => <CheckinRow key={t.topicId} item={t} today={today} busy={busy} onMark={mark} compact />)}</ul>
              </>
            )}
            {error && <p className="cc-error" role="alert">{error}</p>}
            <div className="cc-modal-foot">
              <button type="button" ref={firstButton} className={modal.moment === 'start' ? 'primary' : 'cc-later'} onClick={closeModal}>
                {modal.moment === 'start' ? 'Entendido' : 'Recordármelo en 30 min'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
