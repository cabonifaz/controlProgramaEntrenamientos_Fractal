import React, { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, CalendarClock, CheckCircle2, ChevronRight, Clock, FileText, ListOrdered, SquareKanban, UserCheck, Users as UsersIcon } from 'lucide-react'
import { apiRequest } from './api'
import { ErrorNote, InstructorAttendancePanel, MaterialViewer, Modal } from './admin.jsx'
import { ReactionBreakdown, ReactionChip, ReactionPicker, aggregate, canReact, useReactionSummary } from './satisfaction.jsx'
import { InstructorAbsenceNotice, useMyInstructorAbsences } from './indicators.jsx'
import { ClassroomPanel } from './classroom.jsx'

// Vista "Avance": kanban de componentes del programa y, al entrar a uno,
// kanban de sus temas. Los datos y las columnas vienen armados por la API
// (GET /api/progress); aqui solo se dibujan. Admins eligen el programa;
// instructores y alumnos ven solo lo suyo.

const PROGRAM_KEY = 'fractal-progress-program'

// El programa elegido se recuerda solo durante la sesion del navegador: al
// volver a entrar se abre de nuevo el programa mas actual.
function readStored(key) {
  try { return sessionStorage.getItem(key) } catch { return null }
}

function writeStored(key, value) {
  try { sessionStorage.setItem(key, value) } catch { /* sin almacenamiento: no se recuerda */ }
}

export const PERIOD_LABEL = { current: 'En curso', upcoming: 'Próximo', past: 'Finalizado', undated: 'Sin fechas', closed: 'Archivado' }
export const programOptionLabel = (p) => `${p.name}${p.cohort ? ` · ${p.cohort}` : ''}${p.period ? ` — ${PERIOD_LABEL[p.period]}` : ''}`

// Programas de la lista de admin (fechas del programa) ordenados igual que
// el tablero: en curso, proximos y finalizados. Los archivados o cancelados
// van al final (nunca se abren por defecto).
export function withPeriod(list, today) {
  const order = { current: 0, upcoming: 1, past: 2, undated: 3, closed: 4 }
  return list.map((p) => {
    const first = p.starts_on ? String(p.starts_on).slice(0, 10) : null
    const last = p.ends_on ? String(p.ends_on).slice(0, 10) : null
    const period = ['archived', 'cancelled'].includes(p.status_code) ? 'closed'
      : !first ? 'undated' : first > today ? 'upcoming' : last && last < today ? 'past' : 'current'
    return { id: p.id, name: p.name, cohort: p.cohort, firstDate: first, lastDate: last, period }
  }).sort((a, b) => order[a.period] - order[b.period]
    || (a.period === 'past' ? (b.lastDate || '').localeCompare(a.lastDate || '') : (a.firstDate || '').localeCompare(b.firstDate || '')))
}

// Fechas YYYY-MM-DD como fecha de calendario (sin corrimiento por zona).
export function formatDay(isoDate, { weekday = true } = {}) {
  if (!isoDate) return null
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('es-PE', { weekday: weekday ? 'short' : undefined, day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

export function daysUntil(isoDate, today) {
  if (!isoDate || !today) return null
  return Math.round((Date.parse(isoDate) - Date.parse(today)) / 86400000)
}

export function relativeDay(isoDate, today) {
  const n = daysUntil(isoDate, today)
  if (n === null) return null
  if (n === 0) return 'Hoy'
  if (n === 1) return 'Mañana'
  if (n > 1 && n < 7) return `En ${n} días`
  return null
}

export function classWhen(topic, today) {
  if (!topic?.scheduledOn) return 'Sin fecha'
  const rel = relativeDay(topic.scheduledOn, today)
  const day = formatDay(topic.scheduledOn)
  const time = topic.startTime ? ` · ${topic.startTime}` : ''
  return `${rel ? `${rel}, ` : ''}${day}${time}`
}

export function ProgressBar({ value, color, label }) {
  return (
    <div className="pg-bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${value}%`, background: color }} />
    </div>
  )
}

function SummaryStrip({ board }) {
  const { summary, today } = board
  return (
    <section className="pg-summary" aria-label="Resumen del avance">
      <article className="pg-stat pg-stat-main">
        <span className="pg-stat-label">Avance general</span>
        <strong>{summary.progressPct}<small>%</small></strong>
        <ProgressBar value={summary.progressPct} color="var(--orange)" label="Avance general del programa" />
        <small className="muted">{summary.counts.completed} de {summary.total} clases dictadas</small>
      </article>
      <article className="pg-stat">
        <span className="pg-stat-label">Componentes completados</span>
        <strong>{summary.componentsCompleted}<small>/{summary.componentCount}</small></strong>
      </article>
      <article className={summary.counts.delayed ? 'pg-stat pg-stat-alert' : 'pg-stat'}>
        <span className="pg-stat-label">Clases atrasadas</span>
        <strong>{summary.counts.delayed}</strong>
        <small className="muted">{summary.counts.delayed ? 'Con fecha pasada sin marcar como dictadas' : 'Todo al día'}</small>
      </article>
      <article className="pg-stat pg-upcoming">
        <span className="pg-stat-label">Próximas clases</span>
        {summary.upcoming.length === 0 ? <small className="muted">No hay clases programadas.</small> : (
          <ul>
            {summary.upcoming.map((t) => (
              <li key={t.id}>
                <i style={{ background: t.palette.primary }} aria-hidden="true" />
                <span><b>{classWhen(t, today)}</b>{t.componentName} · {t.title}</span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  )
}

// Abreviatura y tono de cada estado de asistencia para la grilla.
export const ATTENDANCE_MARKS = {
  present: { short: 'P', tone: 'ok', label: 'Presente' },
  late: { short: 'T', tone: 'warn', label: 'Tarde' },
  left_early: { short: 'R', tone: 'warn', label: 'Retirado' },
  absent: { short: 'A', tone: 'danger', label: 'Ausente' },
  justified_absent: { short: 'J', tone: 'info', label: 'Justificado' },
  approved_leave: { short: 'Pm', tone: 'info', label: 'Permiso' },
}

function attendanceText(attendance) {
  if (!attendance?.recorded) return null
  return `${attendance.present}/${attendance.recorded} asistieron`
}

export function AttendanceMark({ mark }) {
  if (!mark) return <span className="pg-mark empty" title="Sin registro">·<span className="sr-only">Sin registro</span></span>
  const meta = ATTENDANCE_MARKS[mark.code] || { short: '?', tone: 'info' }
  return <span className={`pg-mark ${meta.tone}`} title={mark.label}>{meta.short}<span className="sr-only">{mark.label}</span></span>
}

function ComponentCard({ component, today, onOpen }) {
  const { palette } = component
  return (
    <button type="button" className="pg-card pg-component" style={{ '--pg-color': palette.primary }} onClick={() => onOpen(component)}>
      <span className="pg-card-top">
        <strong>{component.name}</strong>
        <ChevronRight size={16} aria-hidden="true" />
      </span>
      {component.instructors.length > 0 && <span className="pg-meta"><UsersIcon size={14} aria-hidden="true" />{component.instructors.join(', ')}</span>}
      <span className="pg-progress-row">
        <ProgressBar value={component.progressPct} color={palette.primary} label={`Avance de ${component.name}`} />
        <b>{component.progressPct}%</b>
      </span>
      <span className="pg-chips">
        <span className="pg-chip"><CheckCircle2 size={13} aria-hidden="true" />{component.counts.completed}/{component.total} temas</span>
        <span className={component.materialTopicCount < component.topicCount ? 'pg-chip warn' : 'pg-chip'}>
          <FileText size={13} aria-hidden="true" />Material {component.materialTopicCount}/{component.topicCount}
        </span>
        {component.attendance && (
          <span className={component.attendance.pct < 80 ? 'pg-chip warn' : 'pg-chip ok'} title={`${component.attendance.sessions} sesiones con asistencia registrada`}>
            <UserCheck size={13} aria-hidden="true" />Asistencia {component.attendance.pct}%
          </span>
        )}
        {component.counts.delayed > 0 && <span className="pg-chip danger">{component.counts.delayed} atrasado{component.counts.delayed > 1 ? 's' : ''}</span>}
      </span>
      <span className="pg-meta">
        <CalendarClock size={14} aria-hidden="true" />
        {component.nextClass ? <>Próxima: {classWhen(component.nextClass, today)}</> : component.column === 'completed' ? 'Componente cerrado' : 'Sin próxima clase'}
      </span>
    </button>
  )
}

function TopicCard({ topic, today, color, onOpen, reaction, absent }) {
  return (
    <button type="button" className="pg-card pg-topic" style={{ '--pg-color': color }} onClick={() => onOpen(topic)}>
      <span className="pg-card-top">
        <span className="pg-topic-num">Tema {String(topic.position).padStart(2, '0')}</span>
        {topic.hasMaterial
          ? <span className="pg-material" title="Tiene material"><BookOpen size={14} aria-hidden="true" /><span className="sr-only">Tiene material</span></span>
          : <span className="pg-material off" title="Sin material"><BookOpen size={14} aria-hidden="true" /><span className="sr-only">Sin material</span></span>}
      </span>
      <strong>{topic.title}</strong>
      <span className="pg-meta"><Clock size={14} aria-hidden="true" />{classWhen(topic, today)}</span>
      {attendanceText(topic.attendance) && <span className="pg-meta"><UserCheck size={14} aria-hidden="true" />{attendanceText(topic.attendance)}</span>}
      {topic.myAttendance && <span className="pg-meta"><UserCheck size={14} aria-hidden="true" />Tu asistencia: {topic.myAttendance.label}</span>}
      {topic.leaveCount > 0 && <span className="pg-chip warn">{topic.leaveCount} avisó{topic.leaveCount > 1 ? 'aron' : ''} inasistencia</span>}
      {topic.myLeave && <span className="pg-chip warn">Avisaste inasistencia</span>}
      {topic.column === 'delayed' && topic.statusCode !== 'delayed' && topic.statusCode !== 'rescheduled' && (
        <span className="pg-chip danger">Fecha pasada · sin marcar</span>
      )}
      {topic.statusCode === 'rescheduled' && <span className="pg-chip warn">Reprogramado</span>}
      {absent && <span className="pg-chip warn">Avisaste que no dictarás</span>}
      <ReactionChip summary={reaction} />
    </button>
  )
}

function Column({ column, count, children }) {
  return (
    <section className={`pg-column pg-col-${column.key}`} aria-label={`${column.label}: ${count}`}>
      <header><h3>{column.label}</h3><span className="pg-count">{count}</span></header>
      <div className="pg-column-body">
        {count === 0 ? <p className="pg-empty">Nada aquí</p> : children}
      </div>
    </section>
  )
}

function ComponentBoard({ board, onOpen }) {
  return (
    <div className="pg-board pg-board-4">
      {board.componentColumns.map((col) => {
        const items = board.components.filter((c) => c.column === col.key)
        return (
          <Column key={col.key} column={col} count={items.length}>
            {items.map((c) => <ComponentCard key={c.id} component={c} today={board.today} onOpen={onOpen} />)}
          </Column>
        )
      })}
    </div>
  )
}

// Asistencia de una sesion dentro del detalle del tema. El alumno ve solo
// la suya; instructor y admins ven la lista y pueden registrarla.
function SessionAttendance({ session, topic, isStudent, onRegister }) {
  const { token } = session
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isStudent) return
    let cancelled = false
    apiRequest(`/api/topics/${topic.id}/attendance`, { token })
      .then((res) => { if (!cancelled) setRows(res.data || []) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [isStudent, topic.id, token])

  if (isStudent) {
    return (
      <section className="pg-session-att">
        <h4>Tu asistencia</h4>
        {topic.myAttendance
          ? <p className="pg-my-att"><AttendanceMark mark={topic.myAttendance} /> {topic.myAttendance.label}</p>
          : <p className="muted">Todavía no se registró la asistencia de esta sesión.</p>}
      </section>
    )
  }

  const recorded = rows ? rows.filter((r) => r.status_code) : []
  const attended = recorded.filter((r) => r.status_code === 'present' || r.status_code === 'late').length
  const others = Object.entries(recorded.reduce((acc, r) => {
    if (r.status_code !== 'present') acc[r.status_label] = (acc[r.status_label] || 0) + 1
    return acc
  }, {}))
  return (
    <section className="pg-session-att">
      <div className="pg-session-att-head">
        <h4>Asistencia de la sesión</h4>
        {onRegister && (
          <button type="button" className="btn-mini" onClick={onRegister}>
            <UserCheck size={14} aria-hidden="true" /> {recorded.length ? 'Editar asistencia' : 'Registrar asistencia'}
          </button>
        )}
      </div>
      <ErrorNote message={error} />
      {!rows && !error ? <p className="muted">Cargando…</p> : rows && rows.length === 0 ? <p className="muted">No hay alumnos inscritos en este grupo.</p> : rows && (
        <>
          <p className="muted">
            {recorded.length === 0
              ? 'Todavía no se registró la asistencia.'
              : `${attended} de ${recorded.length} asistieron${others.map(([label, n]) => ` · ${n} ${label.toLowerCase()}`).join('')}`}
          </p>
          <ul className="pg-att-list">
            {rows.map((r) => (
              <li key={r.student_id}>
                <AttendanceMark mark={r.status_code ? { code: r.status_code, label: r.status_label } : null} />
                <span>{r.student_name}</span>
                {r.reason_label && <small className="muted">{r.reason_label}</small>}
                {r.leave_status_code && <small className="pill pill-leave" title={r.leave_reason ? `Motivo: ${r.leave_reason}` : undefined}>Avisó inasistencia</small>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function TopicDetail({ session, topic, component, group, today, isStudent, reaction, absence, onAbsenceChanged, onClose, onOpenMaterial, onRegister }) {
  const rows = [
    ['Componente', component.name],
    ['Grupo', group.name],
    ['Instructor', group.instructorName || 'Sin asignar'],
    ['Fecha', topic.scheduledOn ? `${formatDay(topic.scheduledOn)}${relativeDay(topic.scheduledOn, today) ? ` (${relativeDay(topic.scheduledOn, today).toLowerCase()})` : ''}` : 'Sin fecha'],
    ['Horario', topic.startTime ? `${topic.startTime}${topic.endTime ? ` – ${topic.endTime}` : ''}` : '—'],
    ['Duración', topic.durationMinutes ? `${topic.durationMinutes} min` : '—'],
    ['Estado', topic.statusLabel],
    ...(topic.actualDate ? [['Dictado el', formatDay(topic.actualDate)]] : []),
  ]
  return (
    <Modal title={`Tema ${String(topic.position).padStart(2, '0')} · ${topic.title}`} onClose={onClose} wide>
      <div className="pg-detail" style={{ '--pg-color': component.palette.primary }}>
        <dl>
          {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        {topic.description && <p className="muted">{topic.description}</p>}
        <ClassroomPanel session={session} topic={topic} />
        <SessionAttendance session={session} topic={topic} isStudent={isStudent} onRegister={isStudent ? null : onRegister} />
        {isStudent ? <ReactionPicker token={session.token} topic={topic} today={today} /> : (reaction || canReact(topic, today)) && <ReactionBreakdown summary={reaction} />}
        {session.role === 'instructor' && <InstructorAbsenceNotice token={session.token} topic={topic} today={today} absence={absence} onChanged={onAbsenceChanged} />}
        <div className="pg-detail-actions">
          {topic.hasMaterial
            ? <button type="button" className="primary" onClick={onOpenMaterial}><BookOpen size={16} aria-hidden="true" /> Abrir contenido del tema</button>
            : <p className="muted">Este tema todavía no tiene material publicado.</p>}
        </div>
      </div>
    </Modal>
  )
}

// Temario del grupo en lista: una fila por sesion con fecha, estado,
// asistencia y material; cada fila abre el detalle.
function SyllabusTable({ board, group, isStudent, onOpen }) {
  const columnLabel = Object.fromEntries(board.topicColumns.map((c) => [c.key, c.label]))
  return (
    <div className="table-scroll">
      <table className="admin-table pg-syllabus">
        <thead>
          <tr><th>N°</th><th>Tema</th><th>Fecha</th><th>Estado</th><th>{isStudent ? 'Tu asistencia' : 'Asistencia'}</th><th>Material</th><th><span className="sr-only">Acciones</span></th></tr>
        </thead>
        <tbody>
          {group.topics.map((t) => (
            <tr key={t.id}>
              <td>{String(t.position).padStart(2, '0')}</td>
              <td className="pg-syllabus-title">{t.title}</td>
              <td>{classWhen(t, board.today)}</td>
              <td><span className={`pg-status pg-col-${t.column || 'cancelled'}`}>{t.column ? columnLabel[t.column] : t.statusLabel}</span></td>
              <td>
                {isStudent
                  ? (t.myAttendance ? <span className="pg-my-att"><AttendanceMark mark={t.myAttendance} /> {t.myAttendance.label}</span> : <span className="muted">—</span>)
                  : (attendanceText(t.attendance) || <span className="muted">Sin registro</span>)}
              </td>
              <td>{t.hasMaterial ? <span className="pg-material"><BookOpen size={14} aria-hidden="true" />&nbsp;Sí</span> : <span className="muted">No</span>}</td>
              <td><button type="button" className="btn-mini" onClick={() => onOpen(t)}>Ver detalle</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Grilla alumnos x sesiones con el % de cada alumno. Solo columnas de
// sesiones con al menos un registro (las futuras no aportan).
export function AttendanceGrid({ session, group, reloadKey, onOpen }) {
  const { token } = session
  const [students, setStudents] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setError('')
    apiRequest(`/api/progress/groups/${group.id}/attendance`, { token })
      .then((res) => { if (!cancelled) setStudents(res.data || []) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [group.id, token, reloadKey])

  const sessions = students ? group.topics.filter((t) => students.some((s) => s.byTopic[t.id])) : []
  const withRate = students ? students.filter((s) => s.pct !== null) : []
  const average = withRate.length ? Math.round(withRate.reduce((sum, s) => sum + s.pct, 0) / withRate.length) : null
  const atRisk = withRate.filter((s) => s.pct < 80).length

  return (
    <div className="pg-att-view">
      <ErrorNote message={error} />
      {!students && !error ? <p className="muted">Cargando…</p> : students && (
        <>
          <div className="pg-summary pg-att-summary">
            <article className="pg-stat">
              <span className="pg-stat-label">Asistencia promedio</span>
              <strong>{average === null ? '—' : <>{average}<small>%</small></>}</strong>
            </article>
            <article className="pg-stat">
              <span className="pg-stat-label">Sesiones registradas</span>
              <strong>{sessions.length}<small>/{group.topics.length}</small></strong>
            </article>
            <article className={atRisk ? 'pg-stat pg-stat-alert' : 'pg-stat'}>
              <span className="pg-stat-label">Bajo 80 %</span>
              <strong>{atRisk}</strong>
              <small className="muted">{atRisk ? 'para hacer seguimiento' : 'Nadie en riesgo'}</small>
            </article>
          </div>
          {students.length === 0 ? <p className="muted">No hay alumnos inscritos en este grupo.</p> : sessions.length === 0 ? <p className="muted">Todavía no hay sesiones con asistencia registrada.</p> : (
            <div className="table-scroll">
              <table className="admin-table pg-att-grid">
                <thead>
                  <tr>
                    <th>Alumno</th>
                    {sessions.map((t) => (
                      <th key={t.id}>
                        <button type="button" className="pg-att-col" onClick={() => onOpen(t)} title={`${t.title} · ${formatDay(t.scheduledOn) || 'sin fecha'}`}>
                          T{String(t.position).padStart(2, '0')}
                        </button>
                      </th>
                    ))}
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td className="pg-att-name">{s.name}{!s.isActive && <small className="muted"> (inactivo)</small>}</td>
                      {sessions.map((t) => <td key={t.id}><AttendanceMark mark={s.byTopic[t.id]} /></td>)}
                      <td><b className={s.pct !== null && s.pct < 80 ? 'pg-pct danger' : 'pg-pct'}>{s.pct === null ? '—' : `${s.pct}%`}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="pg-legend muted">
            {Object.entries(ATTENDANCE_MARKS).map(([code, m]) => <span key={code}><span className={`pg-mark ${m.tone}`}>{m.short}</span> {m.label}</span>)}
          </p>
        </>
      )}
    </div>
  )
}

const DETAIL_TABS = [
  { key: 'board', label: 'Tablero', Icon: SquareKanban },
  { key: 'syllabus', label: 'Temario', Icon: ListOrdered },
  { key: 'attendance', label: 'Asistencia', Icon: UserCheck },
]

function ComponentDetail({ board, component, session, onBack, onChanged }) {
  const isStudent = session.role === 'student'
  const { byTopic: reactions } = useReactionSummary(session.token, !isStudent)
  const { items: myAbsences, reload: reloadAbsences } = useMyInstructorAbsences(session.token, session.role === 'instructor')
  const absenceFor = (topicId) => myAbsences.find((a) => a.topic_id === topicId) || null
  const [groupId, setGroupId] = useState(component.groups[0]?.id)
  const [tab, setTab] = useState('board')
  const [selectedId, setSelectedId] = useState(null)
  const [materialTopic, setMaterialTopic] = useState(null)
  const [registerTopic, setRegisterTopic] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const group = component.groups.find((g) => g.id === groupId) || component.groups[0]
  const color = component.palette.primary
  // El detalle abierto se lee del tablero actual: tras registrar
  // asistencia muestra los datos recargados.
  const selected = selectedId ? group.topics.find((t) => t.id === selectedId) || null : null
  const openTopic = (t) => setSelectedId(t.id)
  const groupReactions = isStudent ? null : aggregate(group.topics.map((t) => reactions.get(t.id)).filter(Boolean))

  function closeRegister() {
    setRegisterTopic(null)
    setReloadKey((k) => k + 1)
    onChanged()
  }

  return (
    <div className="pg-detail-view">
      <button type="button" className="text-button pg-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Todos los componentes</button>
      <header className="pg-component-head" style={{ '--pg-color': color }}>
        <div>
          <p className="kicker">{component.programName}</p>
          <h2>{component.name}</h2>
          <p className="muted">
            {group.instructorName ? `${group.instructorName} · ` : ''}{group.enrolledStudents} talento{group.enrolledStudents === 1 ? '' : 's'}
            {group.firstDate ? ` · ${formatDay(group.firstDate, { weekday: false })} – ${formatDay(group.lastDate, { weekday: false })}` : ''}
          </p>
        </div>
        <div className="pg-head-stats">
          <div className="pg-head-progress">
            <strong>{group.progressPct}%</strong>
            <ProgressBar value={group.progressPct} color={color} label={`Avance de ${component.name}`} />
            <small className="muted">{group.counts.completed} de {group.total} temas dictados</small>
          </div>
          {groupReactions?.votes > 0 && (
            <div className="pg-head-progress sf-head-stat">
              <strong>{groupReactions.avg.toFixed(1).replace('.', ',')}<small>/5</small></strong>
              <small className="muted">satisfacción · {groupReactions.votes} voto{groupReactions.votes === 1 ? '' : 's'}{groupReactions.repeatCount ? ` · ${groupReactions.repeatCount} piden repetir` : ''}</small>
            </div>
          )}
          {group.attendance && (
            <div className="pg-head-progress">
              <strong>{group.attendance.pct}%</strong>
              <ProgressBar value={group.attendance.pct} color="#12875a" label={`Asistencia de ${component.name}`} />
              <small className="muted">asistencia en {group.attendance.sessions} sesiones</small>
            </div>
          )}
        </div>
      </header>
      {component.groups.length > 1 && (
        <div className="material-tabs pg-groups" role="group" aria-label="Grupo">
          {component.groups.map((g) => (
            <button key={g.id} type="button" className={g.id === group.id ? 'tab-button active' : 'tab-button'} aria-pressed={g.id === group.id} onClick={() => setGroupId(g.id)}>
              {g.name}{g.instructorName ? ` · ${g.instructorName}` : ''}
            </button>
          ))}
        </div>
      )}
      {group.nextClass && (
        <p className="pg-next"><CalendarClock size={16} aria-hidden="true" /> Próxima clase: <b>{classWhen(group.nextClass, board.today)}</b> — {group.nextClass.title}</p>
      )}
      <div className="pg-tabs" role="tablist" aria-label="Vista del componente">
        {DETAIL_TABS.map(({ key, label, Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'pg-tab active' : 'pg-tab'} onClick={() => setTab(key)}>
            <Icon size={15} aria-hidden="true" />{key === 'attendance' && isStudent ? 'Mi asistencia' : label}
          </button>
        ))}
      </div>
      {tab === 'board' && (
        <div className="pg-board pg-board-5">
          {board.topicColumns.map((col) => {
            const items = group.topics.filter((t) => t.column === col.key)
            return (
              <Column key={col.key} column={col} count={items.length}>
                {items.map((t) => <TopicCard key={t.id} topic={t} today={board.today} color={color} onOpen={openTopic} reaction={reactions.get(t.id)} absent={Boolean(absenceFor(t.id))} />)}
              </Column>
            )
          })}
        </div>
      )}
      {tab === 'syllabus' && <SyllabusTable board={board} group={group} isStudent={isStudent} onOpen={openTopic} />}
      {tab === 'attendance' && <AttendanceGrid key={group.id} session={session} group={group} reloadKey={reloadKey} onOpen={openTopic} />}
      {selected && (
        <TopicDetail
          key={`${selected.id}-${reloadKey}`}
          session={session} topic={selected} component={component} group={group} today={board.today} isStudent={isStudent}
          reaction={reactions.get(selected.id)}
          absence={absenceFor(selected.id)}
          onAbsenceChanged={reloadAbsences}
          onClose={() => setSelectedId(null)}
          onOpenMaterial={() => { setMaterialTopic(selected); setSelectedId(null) }}
          onRegister={() => setRegisterTopic(selected)}
        />
      )}
      {registerTopic && (
        <Modal title={`Asistencia — ${registerTopic.title}`} onClose={closeRegister} full>
          <InstructorAttendancePanel
            session={session}
            topic={{ id: registerTopic.id, title: registerTopic.title, scheduled_on: registerTopic.scheduledOn, status_code: registerTopic.statusCode }}
            onBack={closeRegister}
            embedded
          />
        </Modal>
      )}
      {materialTopic && <MaterialViewer session={session} topic={materialTopic} onClose={() => setMaterialTopic(null)} />}
    </div>
  )
}

export function ProgressPanel({ session }) {
  const { token } = session
  const isAdmin = session.role === 'admin' || session.role === 'superAdmin'
  const [programs, setPrograms] = useState(null)
  const [programId, setProgramId] = useState(() => (isAdmin ? readStored(PROGRAM_KEY) || '' : ''))
  const [board, setBoard] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [openComponentId, setOpenComponentId] = useState(null)
  const [boardReload, setBoardReload] = useState(0)

  // Admins: lista de programas para el selector (instructor/alumno la
  // obtienen del mismo tablero).
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    apiRequest('/api/programs', { token })
      .then((res) => {
        if (cancelled) return
        const list = withPeriod(res.data || [], new Date().toISOString().slice(0, 10))
        setPrograms(list)
        setProgramId((current) => (list.some((p) => String(p.id) === String(current)) ? current : String(list[0]?.id || '')))
      })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [isAdmin, token])

  useEffect(() => {
    if (isAdmin && !programId) return
    let cancelled = false
    setLoading(true)
    setError('')
    const query = programId ? `?programId=${programId}` : ''
    apiRequest(`/api/progress${query}`, { token })
      .then((res) => { if (!cancelled) setBoard(res.data) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isAdmin, programId, token, boardReload])

  function chooseProgram(id) {
    if (isAdmin) writeStored(PROGRAM_KEY, id)
    setOpenComponentId(null)
    setProgramId(id)
  }

  // Sin filtro, el tablero del instructor/alumno trae todos sus programas:
  // esa lista alimenta el selector aunque luego se filtre por uno.
  const [ownPrograms, setOwnPrograms] = useState([])
  const [pickedDefault, setPickedDefault] = useState(false)
  useEffect(() => {
    if (isAdmin || !board || programId) return
    setOwnPrograms(board.programs)
    // Con varios programas se abre el mas actual; los demas quedan en el selector.
    if (!pickedDefault && board.programs.length > 1) {
      setPickedDefault(true)
      setProgramId(String(board.programs[0].id))
    }
  }, [isAdmin, board, programId, pickedDefault])
  const programOptions = isAdmin ? (programs || []) : ownPrograms
  const openComponent = board?.components.find((c) => c.id === openComponentId) || null
  const programName = programOptions.find((p) => String(p.id) === String(programId))?.name || (board?.programs.length === 1 ? board.programs[0].name : null)

  return (
    <div className="admin-wrap pg-wrap">
      <div className="pg-title">
        <div>
          <p className="kicker">Avance del programa</p>
          <h1>{programName || 'Avance'}</h1>
          <p className="muted">Estado de cada componente y de sus temas. Toca una tarjeta para ver el detalle.</p>
        </div>
        {programOptions.length > 1 && (
          <label className="pg-program-select">Programa
            <select value={programId} onChange={(e) => chooseProgram(e.target.value)}>
              {!isAdmin && <option value="">Todos mis programas</option>}
              {programOptions.map((p) => <option key={p.id} value={p.id}>{programOptionLabel(p)}</option>)}
            </select>
          </label>
        )}
      </div>
      <ErrorNote message={error} />
      {loading && !board ? <p className="muted">Cargando…</p> : board && board.components.length === 0 ? (
        <section className="panel">
          <p className="muted">{isAdmin ? 'Este programa todavía no tiene temas programados.' : 'Todavía no tienes componentes asignados.'}</p>
        </section>
      ) : board && (
        openComponent
          ? <ComponentDetail key={openComponent.id} board={board} component={openComponent} session={session} onBack={() => setOpenComponentId(null)} onChanged={() => setBoardReload((k) => k + 1)} />
          : <>
              <SummaryStrip board={board} />
              <ComponentBoard board={board} onOpen={(c) => setOpenComponentId(c.id)} />
            </>
      )}
    </div>
  )
}
