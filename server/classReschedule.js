import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'
import { sendMail, classRescheduleEmail } from './mailer.js'
import { postToSlack } from './slackReminders.js'

// Reprogramar una clase que el profesor no puede dictar.
//  - El sistema propone fechas: una franja de clase del programa que este
//    libre (sin otra clase del programa a esa hora), en un dia en que el
//    profesor no dicta otra clase y el grupo no tiene clase, y que entre en
//    la disponibilidad del profesor para el programa.
//  - El profesor elige una y se aplica. El admin puede aplicarla directo o
//    proponerla para que la confirme el profesor (o el propio admin despues).
//  - Al aplicarse: correo y alerta a los alumnos, al profesor y a los admins
//    (menos a quien hizo el cambio) y aviso en el canal de Slack del programa.

const HORIZON_DAYS = 45
const MAX_PROPOSALS = 8

const toMinutes = (hhmm) => { if (!hhmm) return null; const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m }
const overlaps = (a, b) => toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end)
const covers = (block, w) => toMinutes(block.start) <= toMinutes(w.start) && toMinutes(block.end) >= toMinutes(w.end)
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function localToday(timeZone = 'America/Lima', base = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(base)
}
function addDays(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const weekdayOf = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay()
export function dateLabel(iso) {
  const s = new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Todas las franjas validas para mover la clase, en orden de fecha y hora.
export function computeSlots({ ctx, rows, today, horizon = HORIZON_DAYS }) {
  const pick = (k) => rows.filter((r) => r.kind === k).map((r) => ({ ...r, start: r.start_time, end: r.end_time }))
  let windows = pick('window')
  const groupDays = pick('group_day')
  if (!windows.length) windows = groupDays
  let avail = pick('avail')
  const availabilitySource = avail.length ? 'registered' : 'schedule'
  if (!avail.length) avail = groupDays // sin disponibilidad registrada: su horario actual
  const holidays = new Set(rows.filter((r) => r.kind === 'holiday').map((r) => r.d))
  const busy = pick('busy')
  const byDate = new Map()
  for (const b of busy) { if (!byDate.has(b.d)) byDate.set(b.d, []); byDate.get(b.d).push(b) }
  const slots = []
  for (let i = 1; i <= horizon; i += 1) {
    const d = addDays(today, i)
    if (holidays.has(d) || d === ctx.scheduled_on) continue
    const day = byDate.get(d) || []
    if (day.some((b) => Number(b.same_instructor) === 1)) continue // el profesor ya dicta ese dia
    if (day.some((b) => Number(b.group_id) === Number(ctx.group_id))) continue // el grupo ya tiene clase
    const wd = weekdayOf(d)
    const dayWindows = windows.filter((w) => Number(w.weekday) === wd).sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
    const programClasses = day.filter((b) => Number(b.same_program) === 1)
    for (const win of dayWindows) {
      if (!avail.some((a) => Number(a.weekday) === wd && covers(a, win))) continue
      if (programClasses.some((b) => b.start && b.end && overlaps(b, win))) continue // franja ocupada
      slots.push({ date: d, start: win.start, end: win.end, dayFree: programClasses.length === 0, sameTime: win.start === ctx.start_time })
    }
  }
  return { slots, availabilitySource }
}

// Una propuesta por dia (la primera franja libre), hasta MAX_PROPOSALS.
export function proposalsFrom(slots) {
  const seen = new Set(); const out = []
  for (const s of slots) {
    if (seen.has(s.date)) continue
    seen.add(s.date); out.push(s)
    if (out.length >= MAX_PROPOSALS) break
  }
  return out
}

// Fecha y hora escritas a mano. issues = no se puede (bloquea);
// warnings = se puede, pero conviene revisarlo.
export function checkCustomSlot({ ctx, rows, today, nowMinutes, date, start, end }) {
  const issues = [], warnings = []
  const pick = (k) => rows.filter((r) => r.kind === k).map((r) => ({ ...r, start: r.start_time, end: r.end_time }))
  const slot = { start, end }
  if (toMinutes(start) >= toMinutes(end)) issues.push('La hora de fin debe ser posterior a la de inicio.')
  if (date < today || (date === today && toMinutes(start) <= nowMinutes)) issues.push('La fecha y hora ya pasaron.')
  if (date === ctx.scheduled_on && start === ctx.start_time && end === ctx.end_time) issues.push('Es la misma fecha y hora que ya tiene la clase.')
  if (rows.some((r) => r.kind === 'holiday' && r.d === date)) issues.push('Ese día es feriado.')
  const day = pick('busy').filter((b) => b.d === date)
  if (day.some((b) => Number(b.group_id) === Number(ctx.group_id))) issues.push('El grupo ya tiene otra clase ese día.')
  if (day.some((b) => Number(b.same_instructor) === 1 && Number(b.group_id) !== Number(ctx.group_id))) issues.push(`${ctx.instructor_name || 'El profesor'} ya dicta otra clase ese día.`)
  if (issues.length) return { issues, warnings }
  const wd = weekdayOf(date)
  const avail = pick('avail')
  if (avail.length && !avail.some((a) => Number(a.weekday) === wd && covers(a, slot))) warnings.push(`Está fuera de la disponibilidad que registró ${ctx.instructor_name || 'el profesor'} para este programa.`)
  const windows = pick('window')
  if (windows.length && !windows.some((w) => Number(w.weekday) === wd && covers(w, slot))) warnings.push('Está fuera de los días y horas de clase del programa.')
  const clash = day.filter((b) => Number(b.same_program) === 1 && b.start && b.end && overlaps(b, slot))
  if (clash.length) warnings.push(`Se cruza con otra clase del programa a esa hora (${clash.map((b) => `${b.start}–${b.end}`).join(', ')}): alumnos inscritos en ambas no podrían asistir.`)
  return { issues, warnings }
}

function nowMinutesIn(timeZone) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number)
  return p[0] * 60 + p[1]
}

async function checkCustom(req, topicId, { date, start, end }) {
  const [ctx] = await callProcedure('sp_reschedule_topic_context', { ...actor(req), p_topic_id: topicId })
  const tz = ctx.timezone || 'America/Lima'
  const rows = await callProcedure('sp_reschedule_slot_data', { p_topic_id: topicId, p_from: date, p_to: date })
  return checkCustomSlot({ ctx, rows: rows || [], today: localToday(tz), nowMinutes: nowMinutesIn(tz), date, start, end })
}
const MAX_DATE = (today) => addDays(today, 400)

const actor = (req) => ({ p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId })
const fail = (res, err) => { const { status, message } = mapStoredProcedureError(err); res.status(status).json({ message }) }

async function loadOptions(req, topicId) {
  const [ctx] = await callProcedure('sp_reschedule_topic_context', { ...actor(req), p_topic_id: topicId })
  const today = localToday(ctx.timezone || 'America/Lima')
  const rows = await callProcedure('sp_reschedule_slot_data', { p_topic_id: topicId, p_from: today, p_to: addDays(today, HORIZON_DAYS + 1) })
  const { slots, availabilitySource } = computeSlots({ ctx, rows: rows || [], today })
  return { ctx, today, slots, availabilitySource }
}

const sameSlot = (a, b) => a.date === b.date && a.start === b.start && a.end === b.end

function appUrl(slug) {
  const base = process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
  return base ? `${base.replace(/\/$/, '')}${slug ? `/t/${slug}` : '/'}` : null
}

// Avisos: correo + alerta en la app (+ Slack al aplicarse).
export async function notifyReschedule(requestId, kind, actorUserId) {
  const [r] = await callProcedure('sp_class_reschedule_get', { p_request_id: requestId })
  if (!r) return { emails: 0 }
  const oldLabel = r.old_date ? dateLabel(r.old_date) : 'sin fecha'
  const newLabel = dateLabel(r.new_date)
  const range = `${r.new_start}–${r.new_end}`
  const alert = kind === 'applied'
    ? { title: `Clase reprogramada: ${r.title}`, description: `${r.component_name} · ${r.program_name}. Antes: ${oldLabel}${r.old_start ? ` ${r.old_start}` : ''}. Nueva fecha: ${newLabel}, ${range}.${r.reason ? ` Motivo: ${r.reason}` : ''}` }
    : kind === 'proposed'
      ? { title: `Confirma la nueva fecha de tu clase: ${r.title}`, description: `Se propone moverla del ${oldLabel} al ${newLabel}, ${range}. Confírmala o elige otra fecha en la app.` }
      : { title: `${r.instructor_name || 'El profesor'} no aceptó reprogramar: ${r.title}`, description: `Propuesta: ${newLabel}, ${range}.` }
  await callProcedure('sp_class_reschedule_alerts', { p_request_id: requestId, p_event: kind, p_actor_user_id: actorUserId, p_title: alert.title, p_description: alert.description })

  const people = (await callProcedure('sp_class_reschedule_recipients', { p_request_id: requestId })) || []
  const targets = people.filter((p) => p.email && Number(p.user_id) !== Number(actorUserId) && (
    kind === 'applied' || (kind === 'proposed' && p.role === 'instructor') || (kind === 'rejected' && p.role === 'admin')))
  let emails = 0
  for (const p of targets) {
    const mail = classRescheduleEmail({ kind, fullName: p.full_name, role: p.role, r, appUrl: appUrl(r.tenant_slug), oldLabel, newLabel })
    const res = await sendMail({ to: p.email, tenantId: r.tenant_id, ...mail })
    if (res.sent) emails += 1
  }
  let slack = false
  if (kind === 'applied') {
    const [ch] = (await callProcedure('sp_program_slack_channel', { p_program_id: r.program_id })) || []
    if (ch?.webhook_url) {
      const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const res = await postToSlack(ch.webhook_url, {
        text: `Clase reprogramada: ${r.title} — nueva fecha ${newLabel}, ${range}`,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `:calendar: *Clase reprogramada*\n*${esc(r.title)}* · ${esc(r.component_name)}${r.instructor_name ? ` · Prof. ${esc(r.instructor_name)}` : ''}\n~${esc(oldLabel)}${r.old_start ? ` ${esc(r.old_start)}` : ''}~  →  *${esc(newLabel)}, ${esc(range)}*` } }],
      })
      slack = res.ok
    }
  }
  return { emails, slack }
}

function shapeRequest(r) {
  return {
    id: Number(r.id), topicId: Number(r.topic_id), status: r.status, reason: r.reason, requestedRole: r.requested_role, requestedByName: r.requested_by_name,
    oldDate: r.old_date, oldStart: r.old_start, oldEnd: r.old_end, newDate: r.new_date, newStart: r.new_start, newEnd: r.new_end,
    title: r.title, componentName: r.component_name, programName: r.program_name, groupName: r.group_name,
    instructorId: r.instructor_id ? Number(r.instructor_id) : null, instructorName: r.instructor_name, createdAt: r.created_at, resolvedAt: r.resolved_at, note: r.resolution_note,
  }
}

export function registerClassRescheduleRoutes(app) {
  // Propuestas de nuevas fechas para una clase.
  app.get('/api/topics/:id/reschedule-options', authenticate, async (req, res) => {
    const topicId = Number(req.params.id)
    if (!Number.isInteger(topicId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const { ctx, today, slots, availabilitySource } = await loadOptions(req, topicId)
      let pending = null
      if (ctx.pending_id) {
        const [p] = await callProcedure('sp_class_reschedule_get', { p_request_id: ctx.pending_id })
        if (p) pending = shapeRequest(p)
      }
      res.json({ data: {
        today, availabilitySource, proposals: proposalsFrom(slots), totalSlots: slots.length, pending,
        topic: { id: Number(ctx.topic_id), title: ctx.title, date: ctx.scheduled_on, start: ctx.start_time, end: ctx.end_time, componentName: ctx.component_name, programName: ctx.program_name, groupName: ctx.group_name, instructorName: ctx.instructor_name, status: ctx.status_code },
      } })
    } catch (err) { fail(res, err) }
  })

  // Verifica una fecha y hora escritas a mano (para mostrar avisos en pantalla).
  app.post('/api/topics/:id/reschedule-check', authenticate, async (req, res) => {
    const topicId = Number(req.params.id)
    const { date, start, end } = req.body || {}
    if (!Number.isInteger(topicId) || !DATE_RE.test(date || '') || !TIME_RE.test(start || '') || !TIME_RE.test(end || '') || date > MAX_DATE(localToday())) {
      return res.status(400).json({ message: 'Invalid request format' })
    }
    try {
      res.json({ data: await checkCustom(req, topicId, { date, start, end }) })
    } catch (err) { fail(res, err) }
  })

  // Crear: el profesor la aplica; el admin la aplica (apply) o la propone (propose).
  app.post('/api/topics/:id/reschedule-request', authenticate, async (req, res) => {
    const topicId = Number(req.params.id)
    const { date, start, end, reason, mode, custom } = req.body || {}
    if (!Number.isInteger(topicId) || !DATE_RE.test(date || '') || date > MAX_DATE(localToday()) || !TIME_RE.test(start || '') || !TIME_RE.test(end || '')
      || !['apply', 'propose'].includes(mode) || (reason != null && (typeof reason !== 'string' || reason.length > 500))) {
      return res.status(400).json({ message: 'Invalid request format' })
    }
    if (req.user.roleCode === 'instructor' && mode !== 'apply') return res.status(403).json({ message: 'not_authorized' })
    try {
      if (custom === true) {
        const { issues } = await checkCustom(req, topicId, { date, start, end })
        if (issues.length) return res.status(409).json({ message: issues[0], issues })
      } else {
        const { slots } = await loadOptions(req, topicId)
        if (!slots.some((s) => sameSlot(s, { date, start, end }))) return res.status(409).json({ message: 'slot_not_available' })
      }
      const [r] = await callProcedure('sp_class_reschedule_create', { ...actor(req), p_topic_id: topicId, p_new_date: date, p_new_start: start, p_new_end: end, p_reason: reason || null, p_mode: mode })
      const requestId = Number(r.request_id)
      const notified = await notifyReschedule(requestId, mode === 'apply' ? 'applied' : 'proposed', req.user.id).catch((err) => { console.error('[reprogramar] avisos:', err.message); return null })
      res.status(201).json({ data: { requestId, applied: mode === 'apply', notified } })
    } catch (err) { fail(res, err) }
  })

  app.get('/api/class-reschedules', authenticate, async (req, res) => {
    try {
      res.json({ data: ((await callProcedure('sp_class_reschedule_list', actor(req))) || []).map(shapeRequest) })
    } catch (err) { fail(res, err) }
  })

  // Confirmar una propuesta pendiente (la misma fecha u otra de las propuestas).
  app.post('/api/class-reschedules/:id/confirm', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    const { date, start, end, custom: manual } = req.body || {}
    const custom = date || start || end
    if (!Number.isInteger(id) || (custom && (!DATE_RE.test(date || '') || !TIME_RE.test(start || '') || !TIME_RE.test(end || '')))) {
      return res.status(400).json({ message: 'Invalid request format' })
    }
    try {
      const [r] = await callProcedure('sp_class_reschedule_get', { p_request_id: id })
      if (!r) return res.status(404).json({ message: 'reschedule_not_found' })
      if (r.status !== 'pending') return res.status(409).json({ message: 'reschedule_not_pending' })
      const chosen = custom ? { date, start, end } : { date: r.new_date, start: r.new_start, end: r.new_end }
      if (manual === true && custom) {
        const { issues } = await checkCustom(req, Number(r.topic_id), chosen)
        if (issues.length) return res.status(409).json({ message: issues[0], issues })
      } else {
        // La propuesta guardada pudo ser manual: se valida como tal si no esta entre las sugeridas.
        const { slots } = await loadOptions(req, Number(r.topic_id))
        if (!slots.some((s) => sameSlot(s, chosen))) {
          const { issues } = await checkCustom(req, Number(r.topic_id), chosen)
          if (issues.length) return res.status(409).json({ message: issues[0], issues })
        }
      }
      await callProcedure('sp_class_reschedule_confirm', { ...actor(req), p_request_id: id, p_new_date: chosen.date, p_new_start: chosen.start, p_new_end: chosen.end })
      const notified = await notifyReschedule(id, 'applied', req.user.id).catch((err) => { console.error('[reprogramar] avisos:', err.message); return null })
      res.json({ data: { ok: true, notified } })
    } catch (err) { fail(res, err) }
  })

  // Rechazar (profesor) o retirar (admin) una propuesta pendiente.
  app.post('/api/class-reschedules/:id/reject', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    const { note } = req.body || {}
    if (!Number.isInteger(id) || (note != null && (typeof note !== 'string' || note.length > 300))) return res.status(400).json({ message: 'Invalid request format' })
    try {
      await callProcedure('sp_class_reschedule_cancel', { ...actor(req), p_request_id: id, p_note: note || null })
      if (req.user.roleCode === 'instructor') await notifyReschedule(id, 'rejected', req.user.id).catch((err) => console.error('[reprogramar] avisos:', err.message))
      res.json({ data: { ok: true } })
    } catch (err) { fail(res, err) }
  })
}
