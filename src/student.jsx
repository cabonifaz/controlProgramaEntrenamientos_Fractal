import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, UserCheck, UserX, Users as UsersIcon } from 'lucide-react'
import { apiRequest } from './api'
import { ErrorNote, EvidencePicker, MaterialViewer, Modal, postLeaveRequest } from './admin.jsx'
import { AttendanceMark, ProgressBar, classWhen, formatDay, relativeDay } from './progress.jsx'

// Vistas del alumno: "Mi horario" (calendario semana / mes / programa),
// "Mis temas" (programas -> componentes -> temas con su avance) y
// "Asistencia" (record por componente y avisos de inasistencia). Todas
// salen del mismo tablero de avance (GET /api/progress), ya acotado a los
// grupos en los que el alumno esta inscrito.

function useStudentBoard(token) {
  const [board, setBoard] = useState(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiRequest('/api/progress', { token })
      .then((res) => { if (!cancelled) { setBoard(res.data); setError('') } })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [token, reloadKey])

  return { board, error, reload: useCallback(() => setReloadKey((k) => k + 1), []) }
}

// Todos los temas del tablero en una lista plana, con su componente.
function flattenTopics(components) {
  return components.flatMap((c) => c.groups.flatMap((g) => g.topics.map((t) => ({
    ...t, componentId: c.id, componentName: c.name, programId: c.programId, programName: c.programName,
    groupName: g.name, instructorName: g.instructorName, palette: c.palette,
  }))))
}

const byDate = (a, b) => ((a.scheduledOn || '9999') + (a.startTime || '')).localeCompare((b.scheduledOn || '9999') + (b.startTime || ''))
const isUpcoming = (t) => (t.column === 'scheduled' || t.column === 'in_progress') && t.scheduledOn
const percent = (part, whole) => (whole > 0 ? Math.round((100 * part) / whole) : 0)

// Programa elegido (si el alumno esta en varios) y sus componentes.
function useProgramFilter(board) {
  const [programId, setProgramId] = useState(null)
  const programs = board?.programs || []
  const current = programs.find((p) => p.id === programId) || programs[0] || null
  const components = useMemo(() => (board && current ? board.components.filter((c) => c.programId === current.id) : []), [board, current])
  const topics = useMemo(() => flattenTopics(components).sort(byDate), [components])
  return { programs, current, setProgramId, components, topics }
}

function ProgramPicker({ programs, current, onChange }) {
  if (programs.length < 2) return null
  return (
    <label className="st-program-picker">Programa
      <select value={current?.id ?? ''} onChange={(e) => onChange(Number(e.target.value))}>
        {programs.map((p) => <option key={p.id} value={p.id}>{p.name}{p.cohort ? ` · ${p.cohort}` : ''}</option>)}
      </select>
    </label>
  )
}

// Estado del tema contado desde el alumno: si el profesor ya lo dicto.
const TOPIC_STATE = {
  completed: { label: 'Dictado', tone: 'ok' },
  in_progress: { label: 'En curso', tone: 'info' },
  scheduled: { label: 'Programado', tone: '' },
  delayed: { label: 'Atrasado', tone: 'danger' },
  pending: { label: 'Sin fecha', tone: '' },
}

function TopicState({ topic }) {
  const state = TOPIC_STATE[topic.column] || { label: topic.statusLabel, tone: '' }
  return <span className={`pg-chip ${state.tone}`}>{topic.column === 'completed' && <CheckCircle2 size={13} aria-hidden="true" />}{state.label}</span>
}

function LeaveChip({ leave }) {
  if (!leave) return null
  return <span className="pg-chip warn"><UserX size={13} aria-hidden="true" />{leave.status === 'approved' ? 'Inasistencia aprobada' : 'Avisaste que no asistirás'}</span>
}

// ===================================================================
// Detalle de una clase con las acciones del alumno: abrir el material y
// avisar (o retirar el aviso) de que no asistira. El aviso le llega como
// alerta al instructor que dicta la clase.
function ClassModal({ session, topic, today, startWithNotice = false, onClose, onChanged }) {
  const { token } = session
  const [noticeOpen, setNoticeOpen] = useState(startWithNotice)
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [materialOpen, setMaterialOpen] = useState(false)
  const canNotify = isUpcoming(topic) && topic.scheduledOn >= today && !topic.myLeave

  async function sendNotice(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await postLeaveRequest(token, { topicId: topic.id, reason: reason.trim() }, evidence)
      setDone(`Listo. ${topic.instructorName || 'Tu instructor'} recibirá el aviso.`)
      setNoticeOpen(false)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function cancelNotice() {
    setBusy(true)
    setError('')
    try {
      await apiRequest(`/api/leave-requests/${topic.myLeave.id}/cancel`, { method: 'POST', token })
      setDone('Retiraste el aviso de inasistencia.')
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const rel = topic.scheduledOn ? relativeDay(topic.scheduledOn, today) : null
  const rows = [
    ['Componente', topic.componentName],
    ['Instructor', topic.instructorName || 'Sin asignar'],
    ['Fecha', topic.scheduledOn ? `${formatDay(topic.scheduledOn)}${rel ? ` (${rel.toLowerCase()})` : ''}` : 'Sin fecha'],
    ['Horario', topic.startTime ? `${topic.startTime}${topic.endTime ? ` – ${topic.endTime}` : ''}` : '—'],
    ['Grupo', topic.groupName],
  ]

  return (
    <>
      <Modal title={`Tema ${String(topic.position).padStart(2, '0')} · ${topic.title}`} onClose={onClose} wide>
        <div className="pg-detail" style={{ '--pg-color': topic.palette.primary }}>
          <div className="st-chips"><TopicState topic={topic} /><LeaveChip leave={topic.myLeave} /></div>
          <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          {topic.description && <p className="muted">{topic.description}</p>}
          <section className="pg-session-att">
            <h4>Tu asistencia</h4>
            {topic.myAttendance
              ? <p className="pg-my-att"><AttendanceMark mark={topic.myAttendance} /> {topic.myAttendance.label}</p>
              : <p className="muted">{topic.column === 'completed' ? 'El instructor todavía no registró la asistencia.' : 'Se registra el día de la clase.'}</p>}
          </section>
          {done && <p className="st-done" role="status">{done}</p>}
          <ErrorNote message={error} />
          {noticeOpen && (
            <form className="st-notice-form" onSubmit={sendNotice}>
              <h4>Avisar que no asistiré</h4>
              <p className="muted">Le llega a {topic.instructorName || 'tu instructor'} como alerta, y el administrador puede aprobarlo como permiso.</p>
              <label>Motivo<textarea value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={500} placeholder="Ej.: cita médica" /></label>
              <EvidencePicker file={evidence} onChange={setEvidence} />
              <div className="st-form-actions">
                <button type="submit" className="primary" disabled={busy || !reason.trim()}>{busy ? 'Enviando…' : 'Enviar aviso'}</button>
                <button type="button" className="btn-mini" onClick={() => setNoticeOpen(false)}>Cancelar</button>
              </div>
            </form>
          )}
          <div className="pg-detail-actions st-actions">
            {topic.hasMaterial && <button type="button" className="primary" onClick={() => setMaterialOpen(true)}><BookOpen size={16} aria-hidden="true" /> Abrir contenido del tema</button>}
            {canNotify && !noticeOpen && <button type="button" className="btn-mini" onClick={() => setNoticeOpen(true)}><UserX size={14} aria-hidden="true" /> Avisar que no asistiré</button>}
            {topic.myLeave?.status === 'pending' && <button type="button" className="btn-mini" onClick={cancelNotice} disabled={busy}>Retirar aviso</button>}
          </div>
        </div>
      </Modal>
      {materialOpen && <MaterialViewer session={session} topic={topic} onClose={() => setMaterialOpen(false)} />}
    </>
  )
}

// El detalle abierto se busca por id en el tablero vigente, para que tras
// avisar (y recargar) muestre el estado nuevo sin cerrarse.
function useOpenClass(topics) {
  const [open, setOpen] = useState(null)
  const topic = open ? topics.find((t) => t.id === open.id) || null : null
  return { topic, notice: open?.notice || false, openClass: (t, notice = false) => setOpen({ id: t.id, notice }), close: () => setOpen(null) }
}

// ===================================================================
// Calendario: fechas YYYY-MM-DD tratadas como dias de calendario (UTC).
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const toDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const toIso = (date) => date.toISOString().slice(0, 10)
const addDays = (iso, n) => { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d) }
const weekStart = (iso) => addDays(iso, -((toDate(iso).getUTCDay() + 6) % 7))
const monthStart = (iso) => `${iso.slice(0, 7)}-01`
const addMonths = (iso, n) => { const d = toDate(monthStart(iso)); d.setUTCMonth(d.getUTCMonth() + n); return toIso(d) }
const fmt = (iso, opts) => new Intl.DateTimeFormat('es-PE', { ...opts, timeZone: 'UTC' }).format(toDate(iso))
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)
const monthLabel = (iso) => capitalize(fmt(iso, { month: 'long', year: 'numeric' }))

function groupByDay(topics) {
  const map = new Map()
  topics.forEach((t) => { if (t.scheduledOn) { if (!map.has(t.scheduledOn)) map.set(t.scheduledOn, []); map.get(t.scheduledOn).push(t) } })
  return map
}

// Las 6 semanas que cubren el mes (empieza en lunes).
function monthCells(iso) {
  const start = weekStart(monthStart(iso))
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

function ClassChip({ topic, onOpen, compact = false }) {
  return (
    <button type="button" className={`st-event st-event-${topic.column}${compact ? ' compact' : ''}`} style={{ '--pg-color': topic.palette.primary }} onClick={() => onOpen(topic)}
      title={`${topic.startTime || ''} ${topic.componentName}: ${topic.title}`}>
      {!compact && <span className="st-event-time">{topic.startTime ? `${topic.startTime}${topic.endTime ? `–${topic.endTime}` : ''}` : 'Sin hora'}</span>}
      <strong>{compact && topic.startTime ? `${topic.startTime} ` : ''}{topic.title}</strong>
      {!compact && <span className="st-event-meta">{topic.componentName}</span>}
      {!compact && (topic.column === 'completed' || topic.myLeave) && (
        <span className="st-event-flags">
          {topic.column === 'completed' && <span><CheckCircle2 size={12} aria-hidden="true" />Dictado</span>}
          {topic.myLeave && <span><UserX size={12} aria-hidden="true" />Aviso</span>}
        </span>
      )}
    </button>
  )
}

function WeekView({ anchor, byDay, today, onOpen }) {
  const start = weekStart(anchor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div className="st-week">
      {days.map((day, i) => {
        const items = byDay.get(day) || []
        return (
          <section key={day} className={`st-day${day === today ? ' today' : ''}${items.length ? '' : ' empty'}`} aria-label={fmt(day, { weekday: 'long', day: 'numeric', month: 'long' })}>
            <header><span>{WEEKDAYS[i]}</span><b>{fmt(day, { day: 'numeric' })}</b>{day === today && <em>Hoy</em>}</header>
            <div className="st-day-body">
              {items.length === 0 ? <p className="st-no-class">Sin clases</p> : items.map((t) => <ClassChip key={t.id} topic={t} onOpen={onOpen} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function MonthView({ anchor, byDay, today, onOpen }) {
  const month = anchor.slice(0, 7)
  const cells = monthCells(anchor)
  const monthTopics = [...byDay.entries()].filter(([d]) => d.startsWith(month)).sort(([a], [b]) => a.localeCompare(b))
  return (
    <>
      <div className="st-month" role="grid" aria-label={monthLabel(anchor)}>
        {WEEKDAYS.map((w) => <div key={w} className="st-month-head" role="columnheader">{w}</div>)}
        {cells.map((day) => {
          const items = byDay.get(day) || []
          return (
            <div key={day} role="gridcell" className={`st-cell${day.startsWith(month) ? '' : ' out'}${day === today ? ' today' : ''}`}>
              <span className="st-cell-num">{Number(day.slice(8))}</span>
              {items.slice(0, 2).map((t) => <ClassChip key={t.id} topic={t} onOpen={onOpen} compact />)}
              {items.length > 2 && <button type="button" className="st-more" onClick={() => onOpen(items[2])}>+{items.length - 2} más</button>}
              {items.length > 0 && <span className="st-dots" aria-hidden="true">{items.map((t) => <i key={t.id} style={{ background: t.palette.primary }} />)}</span>}
            </div>
          )
        })}
      </div>
      {/* En pantallas angostas la grilla solo muestra puntos: la lista da el detalle. */}
      <div className="st-month-agenda">
        {monthTopics.length === 0 ? <p className="muted">No tienes clases este mes.</p> : monthTopics.map(([day, items]) => (
          <section key={day}>
            <h4>{capitalize(fmt(day, { weekday: 'long', day: 'numeric', month: 'short' }))}{day === today ? ' · Hoy' : ''}</h4>
            {items.map((t) => <ClassChip key={t.id} topic={t} onOpen={onOpen} />)}
          </section>
        ))}
      </div>
    </>
  )
}

// Todo el programa: un mini-mes por cada mes con clases (1, 2 o los que
// dure). Tocar un dia lleva a esa semana.
function ProgramView({ topics, byDay, today, components, onPickDay }) {
  const dates = topics.map((t) => t.scheduledOn).filter(Boolean)
  if (dates.length === 0) return <p className="muted">Este programa todavía no tiene clases con fecha.</p>
  const first = monthStart(dates[0])
  const last = monthStart(dates.at(-1))
  const months = []
  for (let m = first; m <= last; m = addMonths(m, 1)) months.push(m)
  return (
    <>
      <ul className="st-legend">
        {components.map((c) => <li key={c.id}><i style={{ background: c.palette.primary }} aria-hidden="true" />{c.name}</li>)}
      </ul>
      <p className="muted st-legend-note">Color intenso: clase por dictar · color claro: clase ya dictada · borde naranja: hoy. Toca un día para ver esa semana.</p>
      <div className="st-program-months">
        {months.map((m) => {
          const month = m.slice(0, 7)
          const count = dates.filter((d) => d.startsWith(month)).length
          return (
            <section key={m} className="st-mini">
              <h4>{monthLabel(m)} <small>{count} clase{count === 1 ? '' : 's'}</small></h4>
              <div className="st-mini-grid">
                {WEEKDAYS.map((w) => <span key={w} className="st-mini-head">{w[0]}</span>)}
                {monthCells(m).map((day) => {
                  const items = byDay.get(day) || []
                  if (!day.startsWith(month)) return <span key={day} className="st-mini-day out" />
                  const label = `${fmt(day, { weekday: 'long', day: 'numeric', month: 'long' })}: ${items.length ? items.map((t) => t.title).join(', ') : 'sin clases'}`
                  return items.length ? (
                    <button key={day} type="button" className={`st-mini-day has${day === today ? ' today' : ''}${items.every((t) => t.column === 'completed') ? ' done' : ''}`}
                      style={{ '--pg-color': items[0].palette.primary }} onClick={() => onPickDay(day)} title={label} aria-label={label}>
                      {Number(day.slice(8))}
                    </button>
                  ) : <span key={day} className={`st-mini-day${day === today ? ' today' : ''}`} title={label}>{Number(day.slice(8))}</span>
                })}
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}

const CAL_VIEWS = [
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'program', label: 'Todo el programa' },
]

export function StudentSchedulePanel({ session }) {
  const { board, error, reload } = useStudentBoard(session.token)
  const { programs, current, setProgramId, components, topics } = useProgramFilter(board)
  const [view, setView] = useState('week')
  const [anchor, setAnchor] = useState(null)
  const today = board?.today
  const upcoming = useMemo(() => topics.filter(isUpcoming).slice(0, 3), [topics])
  const byDay = useMemo(() => groupByDay(topics), [topics])
  const { topic: openTopic, notice, openClass, close } = useOpenClass(topics)

  // Por defecto se abre en la semana de la clase mas cercana.
  useEffect(() => {
    if (board && !anchor) setAnchor(upcoming[0]?.scheduledOn || board.today)
  }, [board, anchor, upcoming])

  if (error) return <div className="admin-wrap"><ErrorNote message={error} /></div>
  if (!board || !anchor) return <div className="admin-wrap"><p className="muted">Cargando…</p></div>
  if (!current) return <div className="admin-wrap"><section className="panel"><p className="muted">Todavía no estás inscrito en ningún programa.</p></section></div>

  const step = (n) => setAnchor(view === 'week' ? addDays(anchor, 7 * n) : addMonths(anchor, n))
  const weekFrom = weekStart(anchor)
  const rangeLabel = view === 'week'
    ? `${fmt(weekFrom, { day: 'numeric', month: 'short' })} – ${fmt(addDays(weekFrom, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`
    : view === 'month' ? monthLabel(anchor) : `${current.name}${current.cohort ? ` · ${current.cohort}` : ''}`

  return (
    <div className="admin-wrap st-wrap">
      <div className="st-head">
        <div>
          <h2>Mi horario</h2>
          <p className="muted">Tus clases de {current.name}. Toca una clase para ver el tema o avisar que no asistirás.</p>
        </div>
        <ProgramPicker programs={programs} current={current} onChange={(id) => { setProgramId(id); setAnchor(null) }} />
      </div>

      <section className="st-next" aria-label="Próximas clases">
        {upcoming.length === 0 ? <p className="muted">No tienes clases programadas próximamente.</p> : upcoming.map((t, i) => (
          <button key={t.id} type="button" className={`st-next-card${i === 0 ? ' first' : ''}`} style={{ '--pg-color': t.palette.primary }} onClick={() => openClass(t)}>
            <span className="st-next-when"><CalendarClock size={15} aria-hidden="true" />{i === 0 ? 'Próxima clase · ' : ''}{classWhen(t, today)}</span>
            <strong>{t.title}</strong>
            <span className="muted">{t.componentName}{t.instructorName ? ` · ${t.instructorName}` : ''}</span>
            <LeaveChip leave={t.myLeave} />
          </button>
        ))}
      </section>

      <section className="panel st-calendar">
        <div className="st-cal-toolbar">
          <div className="pg-tabs st-tabs" role="tablist" aria-label="Vista del calendario">
            {CAL_VIEWS.map((v) => (
              <button key={v.key} type="button" role="tab" aria-selected={view === v.key} className={view === v.key ? 'pg-tab active' : 'pg-tab'} onClick={() => setView(v.key)}>{v.label}</button>
            ))}
          </div>
          <div className="st-cal-nav">
            {view !== 'program' && (
              <>
                <button type="button" className="btn-mini" onClick={() => step(-1)} aria-label={view === 'week' ? 'Semana anterior' : 'Mes anterior'}><ChevronLeft size={16} aria-hidden="true" /></button>
                <button type="button" className="btn-mini" onClick={() => setAnchor(today)}>Hoy</button>
                <button type="button" className="btn-mini" onClick={() => step(1)} aria-label={view === 'week' ? 'Semana siguiente' : 'Mes siguiente'}><ChevronRight size={16} aria-hidden="true" /></button>
                {upcoming[0] && <button type="button" className="btn-mini" onClick={() => setAnchor(upcoming[0].scheduledOn)}>Próxima clase</button>}
              </>
            )}
            <h3 className="st-range" aria-live="polite">{rangeLabel}</h3>
          </div>
        </div>
        {view === 'week' && <WeekView anchor={anchor} byDay={byDay} today={today} onOpen={openClass} />}
        {view === 'month' && <MonthView anchor={anchor} byDay={byDay} today={today} onOpen={openClass} />}
        {view === 'program' && <ProgramView topics={topics} byDay={byDay} today={today} components={components} onPickDay={(day) => { setAnchor(day); setView('week') }} />}
      </section>

      {openTopic && <ClassModal session={session} topic={openTopic} today={today} startWithNotice={notice} onClose={close} onChanged={reload} />}
    </div>
  )
}

// ===================================================================
// Mis temas: por programa, su % de avance segun las clases ya dictadas, y
// cada componente con su avance y sus temas (si el profesor ya los dicto).
function ComponentSection({ component, today, onOpen, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const topics = component.groups.flatMap((g) => g.topics.map((t) => ({
    ...t, componentId: component.id, componentName: component.name, groupName: g.name, instructorName: g.instructorName, palette: component.palette,
  })))
  const mine = topics.filter((t) => t.myAttendance)
  const attended = mine.filter((t) => t.myAttendance.code === 'present' || t.myAttendance.code === 'late').length
  const panelId = `st-comp-${component.id}`
  return (
    <section className="st-comp" style={{ '--pg-color': component.palette.primary }}>
      <button type="button" className="st-comp-head" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        <span className="st-comp-title">
          <strong>{component.name}</strong>
          {component.instructors.length > 0 && <span className="pg-meta"><UsersIcon size={14} aria-hidden="true" />{component.instructors.join(', ')}</span>}
        </span>
        <span className="st-comp-progress">
          <ProgressBar value={component.progressPct} color={component.palette.primary} label={`Avance de ${component.name}`} />
          <b>{component.progressPct}%</b>
        </span>
        <span className="st-comp-chips">
          <span className="pg-chip"><CheckCircle2 size={13} aria-hidden="true" />{component.counts.completed}/{component.total} dictados</span>
          {mine.length > 0 && <span className={percent(attended, mine.length) < 80 ? 'pg-chip warn' : 'pg-chip ok'}><UserCheck size={13} aria-hidden="true" />Asististe {attended}/{mine.length}</span>}
          {component.nextClass && <span className="pg-chip"><CalendarClock size={13} aria-hidden="true" />{classWhen(component.nextClass, today)}</span>}
        </span>
        <ChevronDown size={18} className="st-caret" aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="table-scroll">
          <table className="admin-table st-topics">
            <thead><tr><th>N°</th><th>Tema</th><th>Fecha</th><th>Estado</th><th>Tu asistencia</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.id} className={t.column === 'completed' ? 'done' : ''}>
                  <td>{String(t.position).padStart(2, '0')}</td>
                  <td className="st-topic-title">{t.title}</td>
                  <td>{t.scheduledOn ? classWhen(t, today) : '—'}</td>
                  <td><span className="st-chips"><TopicState topic={t} /><LeaveChip leave={t.myLeave} /></span></td>
                  <td><AttendanceMark mark={t.myAttendance} /></td>
                  <td className="row-actions"><button type="button" className="btn-mini" onClick={() => onOpen(t)}>{t.hasMaterial ? 'Ver tema' : 'Detalle'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function StudentTopicsOverview({ session }) {
  const { board, error, reload } = useStudentBoard(session.token)
  const allTopics = useMemo(() => (board ? flattenTopics(board.components) : []), [board])
  const { topic: openTopic, openClass, close } = useOpenClass(allTopics)

  if (error) return <div className="admin-wrap"><ErrorNote message={error} /></div>
  if (!board) return <div className="admin-wrap"><p className="muted">Cargando…</p></div>
  if (board.programs.length === 0) return <div className="admin-wrap"><section className="panel"><p className="muted">Todavía no estás inscrito en ningún programa.</p></section></div>

  return (
    <div className="admin-wrap st-wrap">
      {board.programs.map((p) => {
        const components = board.components.filter((c) => c.programId === p.id)
        const total = components.reduce((n, c) => n + c.total, 0)
        const done = components.reduce((n, c) => n + c.counts.completed, 0)
        const pct = percent(done, total)
        const closed = components.filter((c) => c.column === 'completed').length
        // Se abre de entrada el componente que esta en curso (o el primero sin cerrar).
        const active = components.find((c) => c.column === 'in_progress' || c.column === 'delayed') || components.find((c) => c.column !== 'completed')
        return (
          <section key={p.id} className="panel st-program">
            <div className="st-program-head">
              <div>
                <span className="pg-stat-label">Programa</span>
                <h2>{p.name}{p.cohort ? <small> · {p.cohort}</small> : null}</h2>
              </div>
              <div className="st-program-pct">
                <strong>{pct}<small>%</small></strong>
                <ProgressBar value={pct} color="var(--orange)" label={`Avance de ${p.name}`} />
                <small className="muted">{done} de {total} clases dictadas · {closed}/{components.length} componentes completados</small>
              </div>
            </div>
            <div className="st-comps">
              {components.map((c) => <ComponentSection key={c.id} component={c} today={board.today} onOpen={openClass} defaultOpen={c.id === active?.id} />)}
            </div>
          </section>
        )
      })}
      {openTopic && <ClassModal session={session} topic={openTopic} today={board.today} onClose={close} onChanged={reload} />}
    </div>
  )
}

// ===================================================================
// Asistencia del alumno: totales, record por componente, proximas clases
// (con aviso de inasistencia) y sus inasistencias.
const ATTENDED = new Set(['present', 'late'])
const JUSTIFIED = new Set(['justified_absent', 'approved_leave'])

function tally(topics) {
  const marks = topics.filter((t) => t.myAttendance).map((t) => t.myAttendance.code)
  const attended = marks.filter((c) => ATTENDED.has(c)).length
  return {
    sessions: marks.length,
    attended,
    late: marks.filter((c) => c === 'late' || c === 'left_early').length,
    absent: marks.filter((c) => c === 'absent').length,
    justified: marks.filter((c) => JUSTIFIED.has(c)).length,
    pct: marks.length ? percent(attended, marks.length) : null,
  }
}

export function StudentAttendanceView({ session }) {
  const { board, error, reload } = useStudentBoard(session.token)
  const { programs, current, setProgramId, components, topics } = useProgramFilter(board)
  const { topic: openTopic, notice, openClass, close } = useOpenClass(topics)
  const today = board?.today

  if (error) return <div className="admin-wrap"><ErrorNote message={error} /></div>
  if (!board) return <div className="admin-wrap"><p className="muted">Cargando…</p></div>
  if (!current) return <div className="admin-wrap"><section className="panel"><p className="muted">Todavía no estás inscrito en ningún programa.</p></section></div>

  const total = tally(topics)
  const upcoming = topics.filter((t) => isUpcoming(t) && t.scheduledOn >= today).slice(0, 6)
  const notices = topics.filter((t) => t.myLeave && t.scheduledOn >= today)
  const absences = topics.filter((t) => t.myAttendance && !ATTENDED.has(t.myAttendance.code)).sort((a, b) => byDate(b, a))
  const history = topics.filter((t) => t.myAttendance).sort((a, b) => byDate(b, a))

  return (
    <div className="admin-wrap st-wrap">
      <div className="st-head">
        <div>
          <h2>Mi asistencia</h2>
          <p className="muted">Asistir incluye llegar tarde. Si no podrás ir a una clase, avísale a tu instructor desde aquí.</p>
        </div>
        <ProgramPicker programs={programs} current={current} onChange={setProgramId} />
      </div>

      <section className="pg-summary st-att-summary" aria-label="Resumen de asistencia">
        <article className="pg-stat pg-stat-main">
          <span className="pg-stat-label">Asistencia</span>
          <strong>{total.pct ?? '—'}{total.pct !== null && <small>%</small>}</strong>
          <ProgressBar value={total.pct ?? 0} color={total.pct !== null && total.pct < 80 ? '#d64545' : '#1f9d6b'} label="Tu porcentaje de asistencia" />
          <small className="muted">{total.attended} de {total.sessions} sesiones registradas</small>
        </article>
        <article className={total.absent ? 'pg-stat pg-stat-alert' : 'pg-stat'}>
          <span className="pg-stat-label">Inasistencias</span>
          <strong>{total.absent + total.justified}</strong>
          <small className="muted">{total.absent} sin justificar · {total.justified} justificadas</small>
        </article>
        <article className="pg-stat">
          <span className="pg-stat-label">Tardanzas y retiros</span>
          <strong>{total.late}</strong>
        </article>
        <article className="pg-stat">
          <span className="pg-stat-label">Avisos de inasistencia</span>
          <strong>{notices.length}</strong>
          <small className="muted">{notices.length ? `Próximo: ${classWhen(notices[0], today)}` : 'Ninguno para próximas clases'}</small>
        </article>
      </section>

      <section className="panel">
        <h3>Próximas clases</h3>
        {upcoming.length === 0 ? <p className="muted">No tienes clases programadas próximamente.</p> : (
          <ul className="st-upcoming">
            {upcoming.map((t) => (
              <li key={t.id} style={{ '--pg-color': t.palette.primary }}>
                <span className="st-upcoming-when"><Clock size={14} aria-hidden="true" />{classWhen(t, today)}</span>
                <span className="st-upcoming-title"><strong>{t.title}</strong><small className="muted">{t.componentName}{t.instructorName ? ` · ${t.instructorName}` : ''}</small></span>
                <span className="st-upcoming-action">
                  {t.myLeave ? <LeaveChip leave={t.myLeave} /> : <button type="button" className="btn-mini" onClick={() => openClass(t, true)}><UserX size={14} aria-hidden="true" /> Avisar que no asistiré</button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h3>Récord por componente</h3>
        <div className="table-scroll">
          <table className="admin-table st-record">
            <thead><tr><th>Componente</th><th>Sesiones</th><th>Asistí</th><th>Tarde / retiro</th><th>Faltas</th><th>Justificadas</th><th>Asistencia</th></tr></thead>
            <tbody>
              {components.map((c) => {
                const r = tally(topics.filter((t) => t.componentId === c.id))
                return (
                  <tr key={c.id}>
                    <td><span className="st-dot" style={{ background: c.palette.primary }} aria-hidden="true" />{c.name}</td>
                    <td>{r.sessions}</td>
                    <td>{r.attended}</td>
                    <td>{r.late}</td>
                    <td className={r.absent ? 'st-bad' : ''}>{r.absent}</td>
                    <td>{r.justified}</td>
                    <td>{r.pct === null ? <span className="muted">Sin registros</span> : <span className={r.pct < 80 ? 'pg-pct danger' : 'pg-pct'}>{r.pct}%</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="st-two">
        <section className="panel">
          <h3>Mis inasistencias</h3>
          {absences.length === 0 ? <p className="muted">No tienes inasistencias registradas.</p> : (
            <ul className="st-list">
              {absences.map((t) => (
                <li key={t.id}>
                  <AttendanceMark mark={t.myAttendance} />
                  <button type="button" className="st-link" onClick={() => openClass(t)}>{t.title}</button>
                  <small className="muted">{formatDay(t.scheduledOn)} · {t.componentName} · {t.myAttendance.label}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h3>Historial de sesiones</h3>
          {history.length === 0 ? <p className="muted">Todavía no hay registros de asistencia.</p> : (
            <ul className="st-list st-history">
              {history.map((t) => (
                <li key={t.id}>
                  <AttendanceMark mark={t.myAttendance} />
                  <button type="button" className="st-link" onClick={() => openClass(t)}>{t.title}</button>
                  <small className="muted">{formatDay(t.scheduledOn)} · {t.componentName}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {openTopic && <ClassModal session={session} topic={openTopic} today={today} startWithNotice={notice} onClose={close} onChanged={reload} />}
    </div>
  )
}

