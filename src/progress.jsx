import React, { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, CalendarClock, CheckCircle2, ChevronRight, Clock, FileText, Users as UsersIcon } from 'lucide-react'
import { apiRequest } from './api'
import { ErrorNote, MaterialViewer, Modal } from './admin.jsx'

// Vista "Avance": kanban de componentes del programa y, al entrar a uno,
// kanban de sus temas. Los datos y las columnas vienen armados por la API
// (GET /api/progress); aqui solo se dibujan. Admins eligen el programa;
// instructores y alumnos ven solo lo suyo.

const PROGRAM_KEY = 'fractal-progress-program'

function readStored(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

function writeStored(key, value) {
  try { localStorage.setItem(key, value) } catch { /* sin almacenamiento: no se recuerda */ }
}

// Fechas YYYY-MM-DD como fecha de calendario (sin corrimiento por zona).
function formatDay(isoDate, { weekday = true } = {}) {
  if (!isoDate) return null
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('es-PE', { weekday: weekday ? 'short' : undefined, day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

function daysUntil(isoDate, today) {
  if (!isoDate || !today) return null
  return Math.round((Date.parse(isoDate) - Date.parse(today)) / 86400000)
}

function relativeDay(isoDate, today) {
  const n = daysUntil(isoDate, today)
  if (n === null) return null
  if (n === 0) return 'Hoy'
  if (n === 1) return 'Mañana'
  if (n > 1 && n < 7) return `En ${n} días`
  return null
}

function classWhen(topic, today) {
  if (!topic?.scheduledOn) return 'Sin fecha'
  const rel = relativeDay(topic.scheduledOn, today)
  const day = formatDay(topic.scheduledOn)
  const time = topic.startTime ? ` · ${topic.startTime}` : ''
  return `${rel ? `${rel}, ` : ''}${day}${time}`
}

function ProgressBar({ value, color, label }) {
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
        {component.counts.delayed > 0 && <span className="pg-chip danger">{component.counts.delayed} atrasado{component.counts.delayed > 1 ? 's' : ''}</span>}
      </span>
      <span className="pg-meta">
        <CalendarClock size={14} aria-hidden="true" />
        {component.nextClass ? <>Próxima: {classWhen(component.nextClass, today)}</> : component.column === 'completed' ? 'Componente cerrado' : 'Sin próxima clase'}
      </span>
    </button>
  )
}

function TopicCard({ topic, today, color, onOpen }) {
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
      {topic.column === 'delayed' && topic.statusCode !== 'delayed' && topic.statusCode !== 'rescheduled' && (
        <span className="pg-chip danger">Fecha pasada · sin marcar</span>
      )}
      {topic.statusCode === 'rescheduled' && <span className="pg-chip warn">Reprogramado</span>}
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

function TopicDetail({ topic, component, group, today, onClose, onOpenMaterial }) {
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
    <Modal title={`Tema ${String(topic.position).padStart(2, '0')} · ${topic.title}`} onClose={onClose}>
      <div className="pg-detail" style={{ '--pg-color': component.palette.primary }}>
        <dl>
          {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        {topic.description && <p className="muted">{topic.description}</p>}
        <div className="pg-detail-actions">
          {topic.hasMaterial
            ? <button type="button" className="primary" onClick={onOpenMaterial}><BookOpen size={16} aria-hidden="true" /> Abrir contenido del tema</button>
            : <p className="muted">Este tema todavía no tiene material publicado.</p>}
        </div>
      </div>
    </Modal>
  )
}

function ComponentDetail({ board, component, session, onBack }) {
  const [groupId, setGroupId] = useState(component.groups[0]?.id)
  const [selected, setSelected] = useState(null)
  const [materialTopic, setMaterialTopic] = useState(null)
  const group = component.groups.find((g) => g.id === groupId) || component.groups[0]
  const color = component.palette.primary

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
        <div className="pg-head-progress">
          <strong>{group.progressPct}%</strong>
          <ProgressBar value={group.progressPct} color={color} label={`Avance de ${component.name}`} />
          <small className="muted">{group.counts.completed} de {group.total} temas dictados</small>
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
      <div className="pg-board pg-board-5">
        {board.topicColumns.map((col) => {
          const items = group.topics.filter((t) => t.column === col.key)
          return (
            <Column key={col.key} column={col} count={items.length}>
              {items.map((t) => <TopicCard key={t.id} topic={t} today={board.today} color={color} onOpen={setSelected} />)}
            </Column>
          )
        })}
      </div>
      {selected && (
        <TopicDetail
          topic={selected} component={component} group={group} today={board.today}
          onClose={() => setSelected(null)}
          onOpenMaterial={() => { setMaterialTopic(selected); setSelected(null) }}
        />
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

  // Admins: lista de programas para el selector (instructor/alumno la
  // obtienen del mismo tablero).
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    apiRequest('/api/programs', { token })
      .then((res) => {
        if (cancelled) return
        const list = res.data || []
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
  }, [isAdmin, programId, token])

  function chooseProgram(id) {
    if (isAdmin) writeStored(PROGRAM_KEY, id)
    setOpenComponentId(null)
    setProgramId(id)
  }

  // Sin filtro, el tablero del instructor/alumno trae todos sus programas:
  // esa lista alimenta el selector aunque luego se filtre por uno.
  const [ownPrograms, setOwnPrograms] = useState([])
  useEffect(() => {
    if (!isAdmin && board && !programId) setOwnPrograms(board.programs)
  }, [isAdmin, board, programId])
  const programOptions = isAdmin ? (programs || []).map((p) => ({ id: p.id, name: p.name, cohort: p.cohort })) : ownPrograms
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
              {programOptions.map((p) => <option key={p.id} value={p.id}>{p.name}{p.cohort ? ` · ${p.cohort}` : ''}</option>)}
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
          ? <ComponentDetail key={openComponent.id} board={board} component={openComponent} session={session} onBack={() => setOpenComponentId(null)} />
          : <>
              <SummaryStrip board={board} />
              <ComponentBoard board={board} onOpen={(c) => setOpenComponentId(c.id)} />
            </>
      )}
    </div>
  )
}
