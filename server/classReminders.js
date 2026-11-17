import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'
import { mailEnabled, sendMail, classReminderEmail } from './mailer.js'

// Recordatorios de clase por correo. Cada tenant los activa en Configuracion:
//  - la vispera (day_before): desde las 9:00 hora local se avisan las clases de manana;
//  - el mismo dia (same_day): desde las 7:00 se avisan las clases de hoy que aun no empiezan.
// Un correo por persona y dia con todas sus clases (como alumno y como profesor).
// class_reminders guarda lo enviado: nada se repite aunque el proceso corra muchas veces.

const SWEEP_MS = 10 * 60 * 1000
const DAY_BEFORE_FROM_HOUR = 9
const SAME_DAY_FROM_HOUR = 7

// Fecha y hora local de una zona horaria ('America/Lima').
function localNow(timeZone, base = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(base).map((p) => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), time: `${parts.hour}:${parts.minute}` }
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function dateLabel(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('es-PE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
}

function appUrl(slug) {
  const base = process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
  return base ? `${base.replace(/\/$/, '')}${slug ? `/t/${slug}` : '/'}` : null
}

// Avisa las clases de una fecha a cada persona; devuelve cuantos correos salieron.
async function remindTenant(tenant, date, kind, afterTime) {
  const rows = await callProcedure('sp_class_reminders_due', { p_tenant_id: tenant.id, p_date: date, p_kind: kind, p_after_time: afterTime })
  const byUser = new Map()
  for (const r of rows || []) {
    if (!r.email) continue
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, { user: r, classes: [] })
    byUser.get(r.user_id).classes.push(r)
  }
  let sent = 0
  for (const { user, classes } of byUser.values()) {
    const claimed = []
    for (const c of classes) {
      const [res] = await callProcedure('sp_class_reminders_claim', { p_topic_id: c.topic_id, p_user_id: user.user_id, p_kind: kind, p_date: date })
      if (Number(res?.claimed) > 0) claimed.push(c)
    }
    if (!claimed.length) continue
    const mail = classReminderEmail({
      fullName: user.full_name, tenantName: tenant.name, brandColor: tenant.brand_color, timezone: tenant.timezone,
      when: kind === 'same_day' ? 'today' : 'tomorrow', dateLabel: dateLabel(date), appUrl: appUrl(tenant.slug),
      classes: claimed.map((c) => ({
        title: c.title, componentName: c.component_name, programName: c.program_name, start: c.start_time, end: c.end_time,
        meetingUrl: c.meeting_url, instructorName: c.instructor_name, role: c.recipient_role,
      })),
    })
    const result = await sendMail({ to: user.email, ...mail })
    if (result.sent) sent += 1
    else for (const c of claimed) await callProcedure('sp_class_reminders_release', { p_topic_id: c.topic_id, p_user_id: user.user_id, p_kind: kind, p_date: date })
  }
  return sent
}

let running = false
export async function sweepClassReminders(now = new Date()) {
  if (running || !mailEnabled()) return { skipped: true }
  running = true
  let sent = 0
  try {
    const tenants = await callProcedure('sp_class_reminder_tenants')
    for (const t of tenants || []) {
      try {
        const local = localNow(t.timezone || 'America/Lima', now)
        if (t.reminder_same_day && local.hour >= SAME_DAY_FROM_HOUR) sent += await remindTenant(t, local.date, 'same_day', local.time)
        if (t.reminder_day_before && local.hour >= DAY_BEFORE_FROM_HOUR) sent += await remindTenant(t, addDays(local.date, 1), 'day_before', null)
      } catch (err) {
        console.error(`[recordatorios] tenant ${t.id}:`, err.message)
      }
    }
    if (sent) console.log(`[recordatorios] ${sent} correo(s) de clase enviados`)
  } catch (err) {
    console.error('[recordatorios] no se pudo revisar:', err.message)
  } finally {
    running = false
  }
  return { sent }
}

export function startClassReminders() {
  setTimeout(() => sweepClassReminders(), 60 * 1000).unref()
  setInterval(() => sweepClassReminders(), SWEEP_MS).unref()
}

const shape = (r) => r && ({
  tenantId: Number(r.tenant_id), tenantName: r.tenant_name, dayBefore: Boolean(r.reminder_day_before), sameDay: Boolean(r.reminder_same_day),
  timezone: r.timezone, sentLast7Days: Number(r.sent_last_7_days) || 0, lastSentAt: r.last_sent_at || null,
  mailEnabled: mailEnabled(), dayBeforeFromHour: DAY_BEFORE_FROM_HOUR, sameDayFromHour: SAME_DAY_FROM_HOUR,
})

export function registerClassReminderRoutes(app) {
  const actor = (req) => ({ p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId })

  app.get('/api/tenants/:id/reminders', authenticate, async (req, res) => {
    const tenantId = Number(req.params.id)
    if (!Number.isInteger(tenantId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const [row] = await callProcedure('sp_tenant_reminders_get', { ...actor(req), p_tenant_id: tenantId })
      res.json({ data: shape(row) })
    } catch (err) {
      const { status, message } = mapStoredProcedureError(err)
      res.status(status).json({ message })
    }
  })

  app.put('/api/tenants/:id/reminders', authenticate, async (req, res) => {
    const tenantId = Number(req.params.id)
    const { dayBefore, sameDay } = req.body || {}
    if (!Number.isInteger(tenantId) || typeof dayBefore !== 'boolean' || typeof sameDay !== 'boolean') {
      return res.status(400).json({ message: 'Invalid request format' })
    }
    try {
      await callProcedure('sp_tenant_reminders_set', { ...actor(req), p_tenant_id: tenantId, p_day_before: dayBefore, p_same_day: sameDay })
      const [row] = await callProcedure('sp_tenant_reminders_get', { ...actor(req), p_tenant_id: tenantId })
      res.json({ data: shape(row) })
      if (dayBefore || sameDay) sweepClassReminders()
    } catch (err) {
      const { status, message } = mapStoredProcedureError(err)
      res.status(status).json({ message })
    }
  })
}
