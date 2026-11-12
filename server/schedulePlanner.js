import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'

// Generacion automatica de horarios de un programa. Con la disponibilidad
// que cada profesor registro para ESE programa elige los dias y la hora de
// cada grupo y calcula la fecha de cada tema: un tema por dia de clase, sin
// feriados del tenant, sin dos clases del mismo profesor el mismo dia (en
// ningun programa) y sin que dos componentes del programa coincidan el
// mismo dia a la misma hora. Al aplicar, sp_topics_apply_plan guarda
// exactamente esas fechas (todo o nada) y vuelve a validar los cruces.
//
// Modo "sequence": los componentes van uno tras otro (cada uno empieza al
// dia siguiente de que termina el anterior). Modo "parallel": todos
// empiezan en la fecha de inicio. Los grupos de un mismo componente son
// alternativas para los alumnos y pueden ir a la misma hora.
//
// Quien dicta cada grupo lo decide el admin; el generador no asigna
// profesores, solo avisa que componentes quedan sin profesor. Con el
// horario del programa cerrado no se regenera y la disponibilidad queda fija.

// Preferencia de dias para repartir la semana: lun, mie, vie, mar, jue, sab, dom.
const WEEKDAY_PREFERENCE = [1, 3, 5, 2, 4, 6, 0]
export const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const PLANNABLE = new Set(['pending', 'scheduled'])

const toMinutes = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m }
const toHHMM = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
const isoDay = (value) => (value ? (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10) : null)
const nextDay = (iso) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }
const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay()
const parseSchedule = (text) => (text || '').split(',').filter(Boolean).map((s) => { const [weekday, start, end] = s.split('|'); return { weekday: Number(weekday), start, end } })
const overlaps = (a, b) => !(toMinutes(a.end) <= toMinutes(b.start) || toMinutes(a.start) >= toMinutes(b.end))

// La primera franja de cada dia en que cabe la sesion, en el orden de
// preferencia; se toman las N primeras.
function chooseSlots(blocks, sessionsPerWeek, sessionMinutes) {
  const byDay = new Map()
  for (const b of blocks) {
    const start = toMinutes(b.start)
    if (toMinutes(b.end) - start < sessionMinutes) continue
    const current = byDay.get(b.weekday)
    if (!current || start < current.startMin) byDay.set(b.weekday, { weekday: b.weekday, startMin: start })
  }
  return WEEKDAY_PREFERENCE.filter((d) => byDay.has(d)).slice(0, sessionsPerWeek)
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => { const s = byDay.get(d); return { weekday: d, start: toHHMM(s.startMin), end: toHHMM(s.startMin + sessionMinutes) } })
}

// Clases ya ocupadas en el programa por fecha: [{start, end, componentId}].
function createOccupancy() {
  const byDate = new Map()
  return {
    clashes: (date, slot, componentId) => (byDate.get(date) || []).some((o) => o.componentId !== componentId && overlaps(o, slot)),
    add: (date, slot, componentId) => { if (!byDate.has(date)) byDate.set(date, []); byDate.get(date).push({ start: slot.start, end: slot.end, componentId }) },
  }
}

function simulateDates({ startDate, slots, count, holidays, busy, occupancy, componentId }) {
  const slotByWeekday = new Map(slots.map((s) => [s.weekday, s]))
  const dates = []
  let cursor = startDate
  for (let guard = 0; dates.length < count && guard < 3650; guard += 1) {
    const slot = slotByWeekday.get(weekdayOf(cursor))
    if (slot && !holidays.has(cursor) && !busy.has(cursor) && !occupancy.clashes(cursor, slot, componentId)) {
      dates.push(cursor)
      occupancy.add(cursor, slot, componentId)
    }
    cursor = nextDay(cursor)
  }
  return dates
}

// Componentes con algun grupo sin profesor: no se programan hasta asignarlo.
export function unassignedComponents(groups) {
  const list = new Map()
  for (const g of groups) {
    if (g.instructor_id) continue
    if (!list.has(g.component_id)) list.set(g.component_id, { componentId: g.component_id, componentName: g.component_name, groups: [], topics: 0 })
    const c = list.get(g.component_id)
    c.groups.push(g.group_name)
    c.topics += Number(g.topics_to_plan) || 0
  }
  return [...list.values()]
}

export function planProgram({ groups, availability, busyDates, holidays, fixedTopics = [], options }) {
  const { startDate, sessionsPerWeek, sessionMinutes, mode } = options
  const components = []
  for (const g of groups) {
    let c = components.find((x) => x.id === g.component_id)
    if (!c) components.push((c = { id: g.component_id, name: g.component_name, groups: [] }))
    c.groups.push(g)
  }
  // Fechas ya ocupadas por profesor: otros programas + lo que se va planificando.
  const taken = new Map()
  const takenFor = (id) => { if (!taken.has(id)) taken.set(id, new Set(busyDates.get(id) || [])); return taken.get(id) }
  const occupancy = createOccupancy()

  // Un grupo se replanifica si tiene profesor, disponibilidad y temas por programar.
  const plannable = (g) => g.instructor_id && Number(g.topics_to_plan) > 0 && (availability.get(g.instructor_id) || []).length > 0
  // Lo que no se mueve (temas dictados y grupos que no se replanifican)
  // tambien ocupa al profesor y la hora de su componente.
  const groupById = new Map(groups.map((g) => [g.group_id, g]))
  for (const t of fixedTopics) {
    const g = groupById.get(t.group_id)
    const date = isoDay(t.scheduled_on)
    if (!g || !date || (PLANNABLE.has(t.status_code) && plannable(g))) continue
    if (g.instructor_id) takenFor(g.instructor_id).add(date)
    const slot = parseSchedule(g.schedule).find((s) => s.weekday === weekdayOf(date))
    if (slot) occupancy.add(date, slot, g.component_id)
  }

  const plan = []
  let cursor = startDate
  for (const c of components) {
    const componentStart = mode === 'parallel' ? startDate : cursor
    let componentEnd = null
    for (const g of c.groups) {
      const item = {
        groupId: g.group_id, groupName: g.group_name, componentId: c.id, componentName: c.name,
        instructorId: g.instructor_id, instructorName: g.instructor_name, topicsToPlan: Number(g.topics_to_plan) || 0,
        startDate: componentStart, slots: [], dates: [], problems: [],
      }
      plan.push(item)
      if (!item.topicsToPlan) { item.problems.push('No tiene temas por programar.'); continue }
      if (!g.instructor_id) { item.problems.push('Sin profesor asignado: asígnale uno para programarlo.'); continue }
      const blocks = availability.get(g.instructor_id) || []
      if (!blocks.length) { item.problems.push(`${g.instructor_name} no registró su disponibilidad para este programa.`); continue }
      item.slots = chooseSlots(blocks, sessionsPerWeek, sessionMinutes)
      if (!item.slots.length) { item.problems.push(`La disponibilidad de ${g.instructor_name} no tiene franjas de ${sessionMinutes} minutos.`); continue }
      if (item.slots.length < sessionsPerWeek) item.problems.push(`Solo hay ${item.slots.length} día(s) disponible(s) por semana; el componente durará más.`)
      const busy = takenFor(g.instructor_id)
      item.dates = simulateDates({ startDate: componentStart, slots: item.slots, count: item.topicsToPlan, holidays, busy, occupancy, componentId: c.id })
      if (item.dates.length < item.topicsToPlan) item.problems.push('No se encontraron suficientes fechas en los próximos 10 años.')
      item.dates.forEach((d) => busy.add(d))
      item.firstDate = item.dates[0] || null
      item.lastDate = item.dates.at(-1) || null
      if (item.lastDate && (!componentEnd || item.lastDate > componentEnd)) componentEnd = item.lastDate
    }
    if (mode !== 'parallel' && componentEnd) cursor = nextDay(componentEnd)
  }
  return plan
}

// ===================================================================
function sendError(res, err) {
  const { status, message } = mapStoredProcedureError(err)
  res.status(status).json({ message })
}
const actor = (req) => ({ p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId })
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// Filas del SP -> un registro por profesor (y programa) con sus franjas.
function groupAvailability(rows) {
  const list = new Map()
  for (const r of rows) {
    const key = `${r.instructor_id}:${r.program_id}`
    if (!list.has(key)) {
      list.set(key, {
        instructorId: r.instructor_id, instructorName: r.instructor_name, email: r.instructor_email,
        programId: r.program_id, programName: r.program_name, cohort: r.cohort,
        startsOn: isoDay(r.starts_on), endsOn: isoDay(r.ends_on),
        locked: Boolean(r.locked), groupCount: Number(r.group_count) || 0, blocks: [],
      })
    }
    if (r.id) list.get(key).blocks.push({ weekday: r.weekday, start: r.start_time, end: r.end_time })
  }
  return [...list.values()]
}

function readOptions(body, fallbackStart) {
  const sessionsPerWeek = Number(body?.sessionsPerWeek ?? 3)
  const sessionMinutes = Number(body?.sessionMinutes ?? 180)
  const startDate = typeof body?.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate) ? body.startDate : fallbackStart
  const mode = body?.mode === 'parallel' ? 'parallel' : 'sequence'
  if (!Number.isInteger(sessionsPerWeek) || sessionsPerWeek < 1 || sessionsPerWeek > 7
    || !Number.isInteger(sessionMinutes) || sessionMinutes < 30 || sessionMinutes > 600) return null
  return { sessionsPerWeek, sessionMinutes, startDate, mode }
}

async function loadPlanningData(req, programId) {
  const groups = await callProcedure('sp_schedule_planning_groups', { ...actor(req), p_program_id: programId })
  const instructors = groupAvailability(await callProcedure('sp_instructor_availability_list', { ...actor(req), p_program_id: programId }))
  const empty = { groups, instructors, availability: new Map(), busyDates: new Map(), holidays: new Set(), holidayYears: [], fixedTopics: [] }
  if (!groups.length) return empty
  const tenantId = groups[0].tenant_id
  const [busyRows, holidayRows, fixedTopics] = await Promise.all([
    callProcedure('sp_schedule_busy_dates', { ...actor(req), p_program_id: programId }),
    callProcedure('sp_holidays_list', { p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_tenant_id_filter: tenantId }),
    callProcedure('sp_topics_list_by_program', { p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_program_id: programId }),
  ])
  const availability = new Map(instructors.map((a) => [a.instructorId, a.blocks]))
  const busyDates = new Map()
  for (const r of busyRows) {
    if (!busyDates.has(r.instructor_id)) busyDates.set(r.instructor_id, new Set())
    busyDates.get(r.instructor_id).add(isoDay(r.scheduled_on))
  }
  const holidays = new Set(holidayRows.map((h) => isoDay(h.holiday_on)))
  const holidayYears = [...new Set([...holidays].map((d) => Number(d.slice(0, 4))))]
  return { ...empty, availability, busyDates, holidays, holidayYears, fixedTopics }
}

// Fecha de inicio por defecto: el inicio del programa si aun no llega; si
// no, mañana.
function defaultStart(groups) {
  const tomorrow = nextDay(new Date().toISOString().slice(0, 10))
  const programStart = isoDay(groups[0]?.program_starts_on)
  return programStart && programStart > tomorrow ? programStart : tomorrow
}

const closedInfo = (groups) => (groups[0]?.schedule_closed_at
  ? { closedAt: groups[0].schedule_closed_at, closedByName: groups[0].schedule_closed_by_name }
  : null)

function planResponse(data, options) {
  const plan = planProgram({ ...data, options })
  const lastDate = plan.map((p) => p.lastDate).filter(Boolean).sort().at(-1) || null
  const years = []
  if (lastDate) for (let y = Number(options.startDate.slice(0, 4)); y <= Number(lastDate.slice(0, 4)); y += 1) years.push(y)
  return {
    options, plan, lastDate,
    unassigned: unassignedComponents(data.groups),
    missingHolidayYears: years.filter((y) => !data.holidayYears.includes(y)),
    totals: { groups: plan.length, ready: plan.filter(isReady).length, topics: plan.reduce((n, p) => n + p.dates.length, 0) },
  }
}
const isReady = (p) => p.slots.length > 0 && p.topicsToPlan > 0 && p.dates.length === p.topicsToPlan

export function registerSchedulePlannerRoutes(app) {
  // Admin/super admin: ?programId= (todos los profesores del tenant del
  // programa). Profesor: sin programId recibe la suya en cada programa
  // donde dicta.
  app.get('/api/availability', authenticate, async (req, res) => {
    const programId = req.query.programId ? Number(req.query.programId) : null
    if (programId !== null && !Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      res.json({ data: groupAvailability(await callProcedure('sp_instructor_availability_list', { ...actor(req), p_program_id: programId })) })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.put('/api/availability/:instructorId', authenticate, async (req, res) => {
    const instructorId = Number(req.params.instructorId)
    const programId = Number(req.body?.programId)
    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : null
    if (!Number.isInteger(instructorId) || !Number.isInteger(programId) || !blocks || blocks.length > 50
      || blocks.some((b) => !Number.isInteger(b?.weekday) || b.weekday < 0 || b.weekday > 6 || !TIME_RE.test(b.start) || !TIME_RE.test(b.end) || b.start >= b.end)) {
      return res.status(400).json({ message: 'invalid_schedule_day' })
    }
    try {
      await callProcedure('sp_instructor_availability_set', {
        ...actor(req), p_instructor_id: instructorId, p_program_id: programId,
        p_blocks: JSON.stringify(blocks.map((b) => ({ weekday: b.weekday, start: b.start, end: b.end }))),
      })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.get('/api/schedule-planner/:programId', authenticate, async (req, res) => {
    const programId = Number(req.params.programId)
    if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const data = await loadPlanningData(req, programId)
      res.json({
        data: {
          groups: data.groups.map((g) => ({
            groupId: g.group_id, groupName: g.group_name, componentId: g.component_id, componentName: g.component_name,
            instructorId: g.instructor_id, instructorName: g.instructor_name,
            schedule: parseSchedule(g.schedule),
            topicsToPlan: Number(g.topics_to_plan) || 0, topicsTotal: Number(g.topics_total) || 0,
            firstDate: isoDay(g.first_date), lastDate: isoDay(g.last_date),
            hasAvailability: (data.availability.get(g.instructor_id) || []).length > 0,
          })),
          instructors: data.instructors,
          unassigned: unassignedComponents(data.groups),
          closed: closedInfo(data.groups),
          defaultStart: defaultStart(data.groups),
          holidayYears: data.holidayYears,
          tenantId: data.groups[0]?.tenant_id ?? null,
        },
      })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.post('/api/schedule-planner/:programId/preview', authenticate, async (req, res) => {
    const programId = Number(req.params.programId)
    if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const data = await loadPlanningData(req, programId)
      const options = readOptions(req.body, defaultStart(data.groups))
      if (!options) return res.status(400).json({ message: 'Invalid request format' })
      res.json({ data: planResponse(data, options) })
    } catch (err) {
      sendError(res, err)
    }
  })

  // Aplica el plan: horario semanal de cada grupo listo y la fecha de sus
  // temas pendientes o programados (los dictados no se tocan). Los grupos
  // que no estan listos se omiten y conservan lo que tenian.
  app.post('/api/schedule-planner/:programId/apply', authenticate, async (req, res) => {
    const programId = Number(req.params.programId)
    if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const data = await loadPlanningData(req, programId)
      if (closedInfo(data.groups)) return res.status(409).json({ message: 'schedule_closed' })
      const options = readOptions(req.body, defaultStart(data.groups))
      if (!options) return res.status(400).json({ message: 'Invalid request format' })
      const { plan, unassigned } = planResponse(data, options)
      const ready = plan.filter(isReady)
      if (!ready.length) return res.status(409).json({ message: 'plan_incomplete' })
      const [r] = await callProcedure('sp_topics_apply_plan', {
        ...actor(req), p_program_id: programId,
        p_plan: JSON.stringify(ready.map((p) => ({ group_id: p.groupId, days: p.slots, dates: p.dates }))),
      })
      const results = plan.map((p) => (isReady(p)
        ? { groupId: p.groupId, ok: true, topicsScheduled: p.dates.length }
        : { groupId: p.groupId, ok: false, skipped: true, problems: p.problems }))
      res.json({ data: { results, applied: ready.length, topicsScheduled: Number(r?.topics_scheduled) || 0, unassigned } })
    } catch (err) {
      sendError(res, err)
    }
  })

  // Cierra o reabre el horario del programa.
  app.post('/api/schedule-planner/:programId/close', authenticate, async (req, res) => {
    const programId = Number(req.params.programId)
    if (!Number.isInteger(programId) || typeof req.body?.closed !== 'boolean') return res.status(400).json({ message: 'Invalid request format' })
    try {
      await callProcedure('sp_programs_schedule_close', { ...actor(req), p_program_id: programId, p_closed: req.body.closed })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err)
    }
  })
}
