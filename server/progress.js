import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'
import { resolvePalette } from '../src/palette.js'

// Tablero de avance (kanban) por programa: componentes en columnas segun
// su estado y, dentro de cada componente, sus temas por grupo. El SP
// entrega una fila por tema ya acotada al rol; aqui solo se agrupa y se
// clasifica en columnas, con la fecha de hoy en la zona del tenant.

export const TOPIC_COLUMNS = [
  { key: 'pending', label: 'Pendiente' },
  { key: 'scheduled', label: 'Programado' },
  { key: 'in_progress', label: 'En curso' },
  { key: 'delayed', label: 'Atrasado' },
  { key: 'completed', label: 'Completado' },
]

export const COMPONENT_COLUMNS = [
  { key: 'not_started', label: 'Por iniciar' },
  { key: 'in_progress', label: 'En curso' },
  { key: 'delayed', label: 'Atrasado' },
  { key: 'completed', label: 'Completado' },
]

// YYYY-MM-DD de hoy en la zona horaria dada (la del tenant).
export function todayIn(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'America/Lima' }).format(new Date())
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
  }
}

// Una clase con fecha pasada que no se marco como dictada cuenta como
// atrasada aunque siga "Programado": es lo que hay que atender.
export function topicColumn(topic, today) {
  const status = topic.status_code
  if (status === 'completed') return 'completed'
  if (status === 'cancelled') return null
  if (status === 'delayed' || status === 'rescheduled') return 'delayed'
  if (topic.scheduled_on && topic.scheduled_on < today) return 'delayed'
  if (status === 'in_progress' || topic.scheduled_on === today) return 'in_progress'
  if (topic.scheduled_on) return 'scheduled'
  return 'pending'
}

function componentColumn({ total, completed, delayed, started }, componentStatus) {
  if (componentStatus === 'completed' || (total > 0 && completed === total)) return 'completed'
  if (delayed > 0) return 'delayed'
  if (started) return 'in_progress'
  return 'not_started'
}

const percent = (part, whole) => (whole > 0 ? Math.round((100 * part) / whole) : 0)

function nextClassOf(topics) {
  return topics
    .filter((t) => t.column === 'scheduled' || t.column === 'in_progress')
    .filter((t) => t.scheduledOn)
    .sort((a, b) => (a.scheduledOn + (a.startTime || '')).localeCompare(b.scheduledOn + (b.startTime || '')))[0] || null
}

function dateRange(topics) {
  const dates = topics.map((t) => t.scheduledOn).filter(Boolean).sort()
  return { firstDate: dates[0] || null, lastDate: dates.at(-1) || null }
}

// Asistencia agregada de varias sesiones: % de presentes (incluye tarde)
// sobre los registros tomados. null si no hay ninguna sesion registrada.
function attendanceRate(topics) {
  let recorded = 0
  let present = 0
  let sessions = 0
  for (const t of topics) {
    if (!t.attendance?.recorded) continue
    sessions += 1
    recorded += t.attendance.recorded
    present += t.attendance.present
  }
  return sessions ? { sessions, recorded, present, pct: percent(present, recorded) } : null
}

function countColumns(topics) {
  const counts = Object.fromEntries(TOPIC_COLUMNS.map((c) => [c.key, 0]))
  topics.forEach((t) => { if (t.column) counts[t.column] += 1 })
  return counts
}

export function buildProgressBoard(rows, today = todayIn(rows[0]?.timezone)) {
  const components = new Map()

  for (const r of rows) {
    if (!components.has(r.component_id)) {
      components.set(r.component_id, {
        id: r.component_id, name: r.component_name, sortOrder: r.component_sort_order,
        programId: r.program_id, programName: r.program_name, cohort: r.cohort,
        statusCode: r.component_status_code,
        palette: resolvePalette({
          component: { primary: r.color_primary, accent: r.color_accent },
          program: { primary: r.program_color_primary, accent: r.program_color_accent },
          tenantBrand: r.tenant_brand_color,
        }),
        materialTopicFileCount: Number(r.material_topic_file_count) || 0,
        groups: new Map(),
      })
    }
    const component = components.get(r.component_id)
    if (!component.groups.has(r.group_id)) {
      component.groups.set(r.group_id, {
        id: r.group_id, name: r.group_name, instructorName: r.instructor_name,
        enrolledStudents: Number(r.enrolled_students) || 0, topics: [],
      })
    }
    const group = component.groups.get(r.group_id)
    // Posicion = numero del tema-NN.html del material (orden del temario).
    const position = group.topics.length + 1
    group.topics.push({
      id: r.topic_id, position, title: r.title, description: r.description,
      scheduledOn: r.scheduled_on, actualDate: r.actual_date, durationMinutes: r.duration_minutes,
      startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
      endTime: r.end_time ? String(r.end_time).slice(0, 5) : null,
      statusCode: r.status_code, statusLabel: r.status_label,
      column: topicColumn(r, today),
      hasMaterial: position <= component.materialTopicFileCount,
      // null = sin datos para este rol (el alumno solo ve su propio registro)
      attendance: r.attendance_recorded === null || r.attendance_recorded === undefined ? null
        : { recorded: Number(r.attendance_recorded), present: Number(r.attendance_present) },
      myAttendance: r.my_attendance_code ? { code: r.my_attendance_code, label: r.my_attendance_label } : null,
    })
  }

  const list = [...components.values()].map((component) => {
    const groups = [...component.groups.values()].map((g) => {
      const counts = countColumns(g.topics)
      const total = g.topics.filter((t) => t.column).length
      return { ...g, counts, total, progressPct: percent(counts.completed, total), nextClass: nextClassOf(g.topics), ...dateRange(g.topics), attendance: attendanceRate(g.topics) }
    })
    const allTopics = groups.flatMap((g) => g.topics)
    const counts = countColumns(allTopics)
    const total = allTopics.filter((t) => t.column).length
    const started = counts.completed + counts.in_progress > 0
    const withMaterial = groups.length ? Math.max(...groups.map((g) => g.topics.filter((t) => t.hasMaterial).length)) : 0
    const topicCount = groups.length ? Math.max(...groups.map((g) => g.topics.length)) : 0
    const { materialTopicFileCount, ...rest } = component
    return {
      ...rest,
      groups,
      instructors: [...new Set(groups.map((g) => g.instructorName).filter(Boolean))],
      counts, total,
      progressPct: percent(counts.completed, total),
      column: componentColumn({ total, completed: counts.completed, delayed: counts.delayed, started }, component.statusCode),
      topicCount, materialTopicCount: withMaterial,
      nextClass: nextClassOf(allTopics),
      ...dateRange(allTopics),
      attendance: attendanceRate(allTopics),
    }
  })

  const allTopics = list.flatMap((c) => c.groups.flatMap((g) => g.topics.map((t) => ({ ...t, componentId: c.id, componentName: c.name, groupName: g.name, instructorName: g.instructorName, palette: c.palette }))))
  const counts = countColumns(allTopics)
  const total = allTopics.filter((t) => t.column).length
  const upcoming = allTopics
    .filter((t) => (t.column === 'scheduled' || t.column === 'in_progress') && t.scheduledOn)
    .sort((a, b) => (a.scheduledOn + (a.startTime || '')).localeCompare(b.scheduledOn + (b.startTime || '')))
    .slice(0, 5)

  const programs = [...new Map(list.map((c) => [c.programId, { id: c.programId, name: c.programName, cohort: c.cohort }])).values()]

  return {
    today,
    programs,
    summary: {
      total, counts, progressPct: percent(counts.completed, total),
      componentCount: list.length,
      componentsCompleted: list.filter((c) => c.column === 'completed').length,
      upcoming,
    },
    componentColumns: COMPONENT_COLUMNS,
    topicColumns: TOPIC_COLUMNS,
    components: list,
  }
}

// Grilla de asistencia de un grupo: una fila por alumno con su estado en
// cada sesion registrada y su % (presente o tarde cuentan como asistencia).
export function buildGroupAttendance(rows) {
  const students = new Map()
  for (const r of rows) {
    if (!students.has(r.student_id)) {
      students.set(r.student_id, { id: r.student_id, name: r.student_name, isActive: Boolean(r.student_is_active), byTopic: {} })
    }
    if (r.topic_id) students.get(r.student_id).byTopic[r.topic_id] = { code: r.status_code, label: r.status_label }
  }
  return [...students.values()].map((st) => {
    const marks = Object.values(st.byTopic)
    const present = marks.filter((m) => m.code === 'present' || m.code === 'late').length
    return { ...st, recorded: marks.length, present, pct: marks.length ? percent(present, marks.length) : null }
  })
}

export function registerProgressRoutes(app) {
  app.get('/api/progress/groups/:id/attendance', authenticate, async (req, res) => {
    const groupId = Number(req.params.id)
    if (!Number.isInteger(groupId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const rows = await callProcedure('sp_progress_group_attendance', {
        p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
        p_group_id: groupId,
      })
      res.json({ data: buildGroupAttendance(rows) })
    } catch (err) {
      const { status, message } = mapStoredProcedureError(err)
      res.status(status).json({ message })
    }
  })

  app.get('/api/progress', authenticate, async (req, res) => {
    const programId = req.query.programId ? Number(req.query.programId) : null
    if (programId !== null && !Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })

    try {
      const rows = await callProcedure('sp_progress_board', {
        p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
        p_program_id: programId,
      })
      res.json({ data: buildProgressBoard(rows) })
    } catch (err) {
      const { status, message } = mapStoredProcedureError(err)
      res.status(status).json({ message })
    }
  })
}
