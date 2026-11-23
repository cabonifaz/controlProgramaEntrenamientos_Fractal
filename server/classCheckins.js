import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'

// Avisos al profesor para que marque si dicto cada tema: durante la clase,
// al terminarla y al empezar la siguiente. Marcar un tema como dictado es lo
// que reporta sus horas trabajadas (API de horas dictadas), por eso se insiste.
// La fecha y hora se calculan en la zona horaria del tenant (no en UTC: una
// clase de las 19:00 en Lima ya es "manana" en UTC).

function localNow(timeZone, base = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(base).map((p) => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}
const toMinutes = (hhmm) => { if (!hhmm) return null; const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }

// Clasifica las clases del profesor segun la hora local.
export function classifyCheckins(rows, now = new Date()) {
  const tz = rows[0]?.timezone || 'America/Lima'
  const local = localNow(tz, now)
  const live = [], ended = [], delayed = [], upcoming = []
  for (const r of rows) {
    const start = toMinutes(r.start_time), end = toMinutes(r.end_time)
    const item = {
      topicId: Number(r.topic_id), title: r.title, status: r.status_code, date: r.scheduled_on, start: r.start_time, end: r.end_time,
      componentName: r.component_name, programName: r.program_name, groupId: Number(r.group_id), groupName: r.group_name, meetingUrl: r.meeting_url || null,
    }
    const isToday = r.scheduled_on === local.date
    const past = r.scheduled_on < local.date || (isToday && end !== null && local.minutes >= end)
    if (past) {
      item.minutesSinceEnd = isToday ? local.minutes - end : null
      ;(r.status_code === 'delayed' ? delayed : ended).push(item)
    } else if (isToday && start !== null && local.minutes >= start) {
      item.minutesLeft = end - local.minutes
      live.push(item)
    } else if (isToday) {
      item.minutesToStart = start === null ? null : start - local.minutes
      upcoming.push(item)
    }
  }
  return { today: local.date, now: `${String(Math.floor(local.minutes / 60)).padStart(2, '0')}:${String(local.minutes % 60).padStart(2, '0')}`, timezone: tz, live, pending: ended, delayed, upcoming }
}

export function registerClassCheckinRoutes(app) {
  const load = (req) => callProcedure('sp_instructor_class_checkins', { p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode })
  const fail = (res, err) => { const { status, message } = mapStoredProcedureError(err); res.status(status).json({ message }) }

  app.get('/api/me/class-checkins', authenticate, async (req, res) => {
    if (req.user.roleCode !== 'instructor') return res.json({ data: null })
    try {
      res.json({ data: classifyCheckins(await load(req) || []) })
    } catch (err) { fail(res, err) }
  })

  // done=true: dictado (la fecha real es la de la clase; si se dicta antes de
  // lo programado, hoy). done=false: quedo atrasado.
  app.post('/api/me/class-checkins/:topicId', authenticate, async (req, res) => {
    const topicId = Number(req.params.topicId)
    const { done } = req.body || {}
    if (!Number.isInteger(topicId) || typeof done !== 'boolean') return res.status(400).json({ message: 'Invalid request format' })
    if (req.user.roleCode !== 'instructor') return res.status(403).json({ message: 'not_authorized' })
    try {
      const rows = await load(req) || []
      const row = rows.find((r) => Number(r.topic_id) === topicId)
      if (!row) return res.status(404).json({ message: 'topic_not_found' })
      const today = localNow(row.timezone || 'America/Lima').date
      await callProcedure('sp_topics_update_status', {
        p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
        p_topic_id: topicId, p_status_code: done ? 'completed' : 'delayed', p_actual_date: done ? (row.scheduled_on <= today ? row.scheduled_on : today) : null,
      })
      const rest = (await load(req)) || []
      res.json({ data: classifyCheckins(rest) })
    } catch (err) { fail(res, err) }
  })
}
