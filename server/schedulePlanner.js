import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'

// Generacion automatica de horarios de un programa. Con la disponibilidad
// de cada profesor elige los dias y la hora de cada grupo, y simula las
// fechas de sus temas con las mismas reglas que sp_topics_generate_schedule
// (un tema por dia de clase, sin feriados del tenant y sin dos clases del
// mismo profesor el mismo dia). Al aplicar, guarda el horario semanal de
// cada grupo y deja que ese SP fije las fechas.
//
// Modo "sequence": los componentes van uno tras otro (cada uno empieza al
// dia siguiente de que termina el anterior). Modo "parallel": todos
// empiezan en la fecha de inicio. Los grupos de un mismo componente
// siempre van en paralelo.

// Preferencia de dias para repartir la semana: lun, mie, vie, mar, jue, sab, dom.
const WEEKDAY_PREFERENCE = [1, 3, 5, 2, 4, 6, 0]
export const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const toMinutes = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m }
const toHHMM = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
const isoDay = (value) => (value ? (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10) : null)
const nextDay = (iso) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }
const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay()

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

function simulateDates({ startDate, slots, count, holidays, busy }) {
  const weekdays = new Set(slots.map((s) => s.weekday))
  const dates = []
  let cursor = startDate
  for (let guard = 0; dates.length < count && guard < 3650; guard += 1) {
    if (weekdays.has(weekdayOf(cursor)) && !holidays.has(cursor) && !busy.has(cursor)) dates.push(cursor)
    cursor = nextDay(cursor)
  }
  return dates
}

export function planProgram({ groups, availability, busyDates, holidays, options }) {
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
      if (!g.instructor_id) { item.problems.push('El grupo no tiene profesor asignado.'); continue }
      const blocks = availability.get(g.instructor_id) || []
      if (!blocks.length) { item.problems.push(`${g.instructor_name} no registró su disponibilidad.`); continue }
      item.slots = chooseSlots(blocks, sessionsPerWeek, sessionMinutes)
      if (!item.slots.length) { item.problems.push(`La disponibilidad de ${g.instructor_name} no tiene franjas de ${sessionMinutes} minutos.`); continue }
      if (item.slots.length < sessionsPerWeek) item.problems.push(`Solo hay ${item.slots.length} día(s) disponible(s) por semana; el componente durará más.`)
      const busy = takenFor(g.instructor_id)
      item.dates = simulateDates({ startDate: componentStart, slots: item.slots, count: item.topicsToPlan, holidays, busy })
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

function groupAvailability(rows) {
  const list = new Map()
  for (const r of rows) {
    if (!list.has(r.instructor_id)) list.set(r.instructor_id, { instructorId: r.instructor_id, instructorName: r.instructor_name, blocks: [] })
    if (r.id) list.get(r.instructor_id).blocks.push({ weekday: r.weekday, start: r.start_time, end: r.end_time })
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
  if (!groups.length) return { groups, availability: new Map(), busyDates: new Map(), holidays: new Set(), holidayYears: [] }
  const tenantId = groups[0].tenant_id
  const [availRows, busyRows, holidayRows] = await Promise.all([
    callProcedure('sp_instructor_availability_list', actor(req)),
    callProcedure('sp_schedule_busy_dates', { ...actor(req), p_program_id: programId }),
    callProcedure('sp_holidays_list', { p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId, p_tenant_id_filter: tenantId }),
  ])
  const availability = new Map(groupAvailability(availRows).map((a) => [a.instructorId, a.blocks]))
  const busyDates = new Map()
  for (const r of busyRows) {
    if (!busyDates.has(r.instructor_id)) busyDates.set(r.instructor_id, new Set())
    busyDates.get(r.instructor_id).add(isoDay(r.scheduled_on))
  }
  const holidays = new Set(holidayRows.map((h) => isoDay(h.holiday_on)))
  const holidayYears = [...new Set([...holidays].map((d) => Number(d.slice(0, 4))))]
  return { groups, availability, busyDates, holidays, holidayYears }
}

// Fecha de inicio por defecto: el inicio del programa si aun no llega; si
// no, mañana.
function defaultStart(groups) {
  const tomorrow = nextDay(new Date().toISOString().slice(0, 10))
  const programStart = isoDay(groups[0]?.program_starts_on)
  return programStart && programStart > tomorrow ? programStart : tomorrow
}

function planResponse(data, options) {
  const plan = planProgram({ ...data, options })
  const lastDate = plan.map((p) => p.lastDate).filter(Boolean).sort().at(-1) || null
  const years = []
  if (lastDate) for (let y = Number(options.startDate.slice(0, 4)); y <= Number(lastDate.slice(0, 4)); y += 1) years.push(y)
  return {
    options, plan, lastDate,
    missingHolidayYears: years.filter((y) => !data.holidayYears.includes(y)),
    totals: { groups: plan.length, ready: plan.filter((p) => p.dates.length).length, topics: plan.reduce((n, p) => n + p.dates.length, 0) },
  }
}

export function registerSchedulePlannerRoutes(app) {
  app.get('/api/availability', authenticate, async (req, res) => {
    try {
      res.json({ data: groupAvailability(await callProcedure('sp_instructor_availability_list', actor(req))) })
    } catch (err) {
      sendError(res, err)
    }
  })

  app.put('/api/availability/:instructorId', authenticate, async (req, res) => {
    const instructorId = Number(req.params.instructorId)
    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : null
    if (!Number.isInteger(instructorId) || !blocks || blocks.length > 50
      || blocks.some((b) => !Number.isInteger(b?.weekday) || b.weekday < 0 || b.weekday > 6 || !TIME_RE.test(b.start) || !TIME_RE.test(b.end) || b.start >= b.end)) {
      return res.status(400).json({ message: 'invalid_schedule_day' })
    }
    try {
      await callProcedure('sp_instructor_availability_set', {
        ...actor(req), p_instructor_id: instructorId,
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
            schedule: (g.schedule || '').split(',').filter(Boolean).map((s) => { const [weekday, start, end] = s.split('|'); return { weekday: Number(weekday), start, end } }),
            topicsToPlan: Number(g.topics_to_plan) || 0, topicsTotal: Number(g.topics_total) || 0,
            firstDate: isoDay(g.first_date), lastDate: isoDay(g.last_date),
            hasAvailability: (data.availability.get(g.instructor_id) || []).length > 0,
          })),
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

  // Aplica el plan: horario semanal de cada grupo y fechas de sus temas
  // pendientes o programados (los dictados no se tocan).
  app.post('/api/schedule-planner/:programId/apply', authenticate, async (req, res) => {
    const programId = Number(req.params.programId)
    if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const data = await loadPlanningData(req, programId)
      const options = readOptions(req.body, defaultStart(data.groups))
      if (!options) return res.status(400).json({ message: 'Invalid request format' })
      const { plan } = planResponse(data, options)
      const results = []
      for (const item of plan) {
        if (!item.slots.length || !item.dates.length) { results.push({ groupId: item.groupId, ok: false, skipped: true, problems: item.problems }); continue }
        try {
          await callProcedure('sp_group_schedule_replace', { ...actor(req), p_group_id: item.groupId, p_days: JSON.stringify(item.slots) })
          const [r] = await callProcedure('sp_topics_generate_schedule', { ...actor(req), p_group_id: item.groupId, p_start_date: item.startDate })
          results.push({ groupId: item.groupId, ok: true, topicsScheduled: Number(r?.topics_scheduled) || 0 })
        } catch (err) {
          results.push({ groupId: item.groupId, ok: false, message: mapStoredProcedureError(err).message })
        }
      }
      res.json({ data: { results, applied: results.filter((r) => r.ok).length } })
    } catch (err) {
      sendError(res, err)
    }
  })
}
