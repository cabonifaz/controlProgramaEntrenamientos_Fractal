import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'

// Recordatorios de clase en el canal de Slack de cada programa (Incoming
// Webhook). Para las clases de hoy con hora de inicio conocida:
//  - '60': una hora antes (o en cuanto se entra en esa hora);
//  - '15': quince minutos antes.
// Cada aviso lleva el enlace de Teams/Meet de la clase. slack_reminders guarda
// lo enviado, asi nada se repite aunque el proceso corra cada minuto o haya
// varias instancias.

const SWEEP_MS = 60 * 1000
const WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/

export const isSlackWebhook = (url) => typeof url === 'string' && WEBHOOK_RE.test(url.trim())

function localNow(timeZone, base = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(base).map((p) => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

const toMinutes = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m }
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const isHttp = (u) => typeof u === 'string' && /^https?:\/\/\S+$/i.test(u.trim())

function joinLabel(url) {
  if (/teams\.(microsoft|live)\.com/i.test(url)) return 'Unirse por Teams'
  if (/meet\.google\.com/i.test(url)) return 'Unirse por Meet'
  if (/zoom\.us/i.test(url)) return 'Unirse por Zoom'
  return 'Unirse a la clase'
}

function whenLabel(minutes) {
  if (minutes >= 55) return 'En 1 hora'
  if (minutes <= 1) return 'Ahora'
  return `En ${minutes} minutos`
}

// Mensaje de Slack (Block Kit) para las clases que empiezan a una misma hora.
export function slackClassMessage({ programName, minutes, classes }) {
  const when = whenLabel(minutes)
  const start = classes[0].start_time
  const title = classes.length === 1 ? `${when} empieza la clase de las ${start}` : `${when} empiezan ${classes.length} clases (${start})`
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: `${minutes <= 15 ? ':bell:' : ':alarm_clock:'} *${esc(title)}*\n${esc(programName)}` } }]
  for (const c of classes) {
    const detail = [c.component_name, c.group_name, c.instructor_name ? `Prof. ${c.instructor_name}` : null].filter(Boolean).map(esc).join(' · ')
    const time = c.end_time ? `${c.start_time}–${c.end_time}` : c.start_time
    const block = { type: 'section', text: { type: 'mrkdwn', text: `*${esc(c.title)}*\n${detail}\n:clock7: ${time}${isHttp(c.meeting_url) ? '' : '\n_Sin enlace de clase registrado_'}` } }
    if (isHttp(c.meeting_url)) block.accessory = { type: 'button', text: { type: 'plain_text', text: joinLabel(c.meeting_url) }, url: c.meeting_url.trim(), style: 'primary' }
    blocks.push(block)
  }
  const links = classes.filter((c) => isHttp(c.meeting_url)).map((c) => `${c.title}: ${c.meeting_url.trim()}`).join(' | ')
  return { text: `${title} — ${classes.map((c) => c.title).join(', ')}${links ? ` — ${links}` : ''}`, blocks }
}

export async function postToSlack(webhookUrl, payload) {
  try {
    const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) })
    const body = await res.text()
    return res.ok ? { ok: true } : { ok: false, error: `Slack respondió ${res.status}: ${body.slice(0, 120)}` }
  } catch (err) {
    return { ok: false, error: `No se pudo conectar con Slack: ${err.message}` }
  }
}

// Ventana de cada aviso en minutos antes del inicio: (desde, hasta].
const windowFor = (kind, program) => (kind === '15' ? [0, 15] : [program.remind_15 ? 15 : 0, 60])

async function remindProgram(program, now) {
  const local = localNow(program.timezone || 'America/Lima', now)
  let sent = 0
  for (const kind of ['60', '15']) {
    if (!(kind === '60' ? program.remind_60 : program.remind_15)) continue
    const [from, to] = windowFor(kind, program)
    const rows = await callProcedure('sp_slack_classes_due', { p_program_id: program.program_id, p_date: local.date, p_kind: kind })
    const byStart = new Map()
    for (const r of rows || []) {
      const left = toMinutes(r.start_time) - local.minutes
      if (left <= from || left > to) continue
      if (!byStart.has(r.start_time)) byStart.set(r.start_time, { left, classes: [] })
      byStart.get(r.start_time).classes.push(r)
    }
    for (const { left, classes } of byStart.values()) {
      const claimed = []
      for (const c of classes) {
        const [res] = await callProcedure('sp_slack_reminders_claim', { p_program_id: program.program_id, p_topic_id: c.topic_id, p_kind: kind, p_date: local.date })
        if (Number(res?.claimed) > 0) claimed.push(c)
      }
      if (!claimed.length) continue
      const result = await postToSlack(program.webhook_url, slackClassMessage({ programName: program.program_name, minutes: left, classes: claimed }))
      await callProcedure('sp_program_slack_result', { p_program_id: program.program_id, p_error: result.ok ? null : result.error })
      if (result.ok) sent += 1
      else {
        console.error(`[slack] programa ${program.program_id}:`, result.error)
        for (const c of claimed) await callProcedure('sp_slack_reminders_release', { p_topic_id: c.topic_id, p_kind: kind, p_date: local.date })
      }
    }
  }
  return sent
}

let running = false
export async function sweepSlackReminders(now = new Date()) {
  if (running) return { skipped: true }
  running = true
  let sent = 0
  try {
    const programs = await callProcedure('sp_slack_reminder_programs')
    for (const p of programs || []) {
      try { sent += await remindProgram(p, now) } catch (err) { console.error(`[slack] programa ${p.program_id}:`, err.message) }
    }
    if (sent) console.log(`[slack] ${sent} recordatorio(s) de clase enviados`)
  } catch (err) {
    console.error('[slack] no se pudo revisar:', err.message)
  } finally {
    running = false
  }
  return { sent }
}

export function startSlackReminders() {
  setTimeout(() => sweepSlackReminders(), 30 * 1000).unref()
  setInterval(() => sweepSlackReminders(), SWEEP_MS).unref()
}

const shape = (r) => ({
  programId: Number(r.program_id), programName: r.program_name, cohort: r.cohort, status: r.status_code,
  configured: Boolean(r.configured), webhookTail: r.webhook_tail || null, channelName: r.channel_name || '',
  remind60: Boolean(r.remind_60), remind15: Boolean(r.remind_15), lastSentAt: r.last_sent_at, lastError: r.last_error || null,
  sentLast7Days: Number(r.sent_last_7_days) || 0,
})

export function registerSlackRoutes(app) {
  const actor = (req) => ({ p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId })
  const fail = (res, err) => { const { status, message } = mapStoredProcedureError(err); res.status(status).json({ message }) }

  app.get('/api/tenants/:id/slack', authenticate, async (req, res) => {
    const tenantId = Number(req.params.id)
    if (!Number.isInteger(tenantId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const rows = await callProcedure('sp_program_slack_list', { ...actor(req), p_tenant_id: tenantId })
      res.json({ data: (rows || []).map(shape) })
    } catch (err) { fail(res, err) }
  })

  app.put('/api/programs/:id/slack', authenticate, async (req, res) => {
    const programId = Number(req.params.id)
    const { webhookUrl, channelName, remind60, remind15 } = req.body || {}
    const url = typeof webhookUrl === 'string' ? webhookUrl.trim() : ''
    if (!Number.isInteger(programId) || typeof remind60 !== 'boolean' || typeof remind15 !== 'boolean'
      || (channelName != null && (typeof channelName !== 'string' || channelName.length > 120))) {
      return res.status(400).json({ message: 'Invalid request format' })
    }
    if (url && !isSlackWebhook(url)) return res.status(400).json({ message: 'slack_webhook_invalid' })
    try {
      await callProcedure('sp_program_slack_set', {
        ...actor(req), p_program_id: programId, p_webhook_url: url || null,
        p_channel_name: (channelName || '').replace(/^#/, '').trim() || null, p_remind_60: remind60, p_remind_15: remind15,
      })
      res.json({ data: { ok: true } })
      sweepSlackReminders()
    } catch (err) { fail(res, err) }
  })

  app.delete('/api/programs/:id/slack', authenticate, async (req, res) => {
    const programId = Number(req.params.id)
    if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      await callProcedure('sp_program_slack_delete', { ...actor(req), p_program_id: programId })
      res.json({ data: { ok: true } })
    } catch (err) { fail(res, err) }
  })

  app.post('/api/programs/:id/slack/test', authenticate, async (req, res) => {
    const programId = Number(req.params.id)
    if (!Number.isInteger(programId)) return res.status(400).json({ message: 'Invalid request format' })
    try {
      const [cfg] = await callProcedure('sp_program_slack_webhook', { ...actor(req), p_program_id: programId })
      if (!cfg) return res.status(404).json({ message: 'slack_not_configured' })
      const result = await postToSlack(cfg.webhook_url, {
        text: `Fractal quedó conectado al canal de ${cfg.program_name}`,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `:white_check_mark: *Fractal quedó conectado a este canal*\nAquí llegarán los recordatorios de las clases de *${esc(cfg.program_name)}*: una hora antes y 15 minutos antes de cada clase, con el enlace para unirse.` } }],
      })
      await callProcedure('sp_program_slack_result', { p_program_id: programId, p_error: result.ok ? null : result.error })
      if (!result.ok) return res.status(502).json({ message: 'slack_send_failed', detail: result.error })
      res.json({ data: { ok: true } })
    } catch (err) { fail(res, err) }
  })
}
