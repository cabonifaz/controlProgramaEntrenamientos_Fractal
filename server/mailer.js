// Correo transaccional con Resend (https://resend.com). Nunca rompe el flujo
// que lo llama: si no esta configurado o falla, devuelve { sent: false }.
//
// MAIL_MODE:
//   off      -> no envia nada (por defecto).
//   redirect -> el correo va a los administradores del tenant de la persona
//               (con el destinatario real en el asunto); si el tenant no
//               tiene admins con correo real, a MAIL_REDIRECT_TO. Es el modo
//               de staging: con datos reales de produccion, alumnos y
//               profesores no reciben correos de prueba.
//   live     -> envia a los destinatarios reales (produccion).
// MAIL_FROM: remitente de un dominio verificado en Resend.

import { callProcedure } from './db.js'

const RESEND_URL = 'https://api.resend.com/emails'

const mode = () => (process.env.MAIL_MODE || 'off').trim().toLowerCase()

export function mailEnabled() {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return false
  const m = mode()
  return m === 'live' || (m === 'redirect' && Boolean(process.env.MAIL_REDIRECT_TO))
}

// Destino en modo redirect: los admins del tenant o, si no hay, MAIL_REDIRECT_TO.
async function redirectTargets(tenantId) {
  if (tenantId) {
    try {
      const rows = await callProcedure('sp_mail_redirect_targets', { p_tenant_id: tenantId })
      const emails = (rows || []).map((r) => r.email).filter(Boolean)
      if (emails.length) return emails
    } catch (err) {
      console.error('[mail] admins del tenant no disponibles:', err.message)
    }
  }
  return process.env.MAIL_REDIRECT_TO ? [process.env.MAIL_REDIRECT_TO] : []
}

// tenantId: tenant de la persona (en modo redirect decide a que admins llega).
export async function sendMail({ to, subject, html, text, tenantId = null }) {
  if (!to || !mailEnabled()) return { sent: false, reason: 'disabled' }
  const redirect = mode() === 'redirect'
  const recipients = redirect ? await redirectTargets(tenantId) : [to]
  if (!recipients.length) return { sent: false, reason: 'disabled' }
  const body = {
    from: process.env.MAIL_FROM,
    to: recipients,
    subject: redirect ? `[Prueba → ${to}] ${subject}` : subject,
    html,
    text,
  }
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.error('[mail] Resend respondió', res.status, (await res.text()).slice(0, 300))
      return { sent: false, reason: 'provider_error' }
    }
    return { sent: true, redirected: redirect, deliveredTo: recipients }
  } catch (err) {
    console.error('[mail] no se pudo enviar:', err.message)
    return { sent: false, reason: 'network_error' }
  }
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const HEX = /^#[0-9a-f]{6}$/i
// Texto legible sobre el color de marca (oscuro sobre colores claros).
function textOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05) ? '#17232d' : '#ffffff'
}

function formatExpiry(value) {
  if (!value) return ''
  const d = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Invitacion para crear la contrasena (o nueva contrasena si ya tenia una).
export function invitationEmail({ fullName, tenantName, url, isReset, expiresAt, brandColor }) {
  const org = tenantName || 'Fractal'
  const color = HEX.test(brandColor || '') ? brandColor : '#06425e'
  const hello = fullName ? `Hola ${fullName},` : 'Hola,'
  const lead = isReset
    ? `Recibimos un pedido para crear una nueva contraseña de tu cuenta en ${org}.`
    : `Te damos la bienvenida a la plataforma de entrenamiento de ${org}.`
  const action = isReset ? 'Crear nueva contraseña' : 'Crear mi contraseña'
  const expiry = formatExpiry(expiresAt)
  const note = `El enlace es personal y de un solo uso${expiry ? `; vence el ${expiry}` : ''}.`
  const subject = isReset ? `Crea tu nueva contraseña · ${org}` : `Te invitamos a ${org}`
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f5f7f8;font-family:Arial,Helvetica,sans-serif;color:#17232d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #dfe6e9">
<tr><td style="padding:28px 28px 8px"><p style="margin:0 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#5d6b74">${esc(org)} · Training</p>
<h1 style="margin:0;font-size:22px;color:#06425e">${esc(action)}</h1></td></tr>
<tr><td style="padding:12px 28px 4px;font-size:15px;line-height:1.55"><p style="margin:0 0 12px">${esc(hello)}</p><p style="margin:0 0 20px">${esc(lead)} Toca el botón para crear tu contraseña y entrar.</p>
<p style="margin:0 0 24px"><a href="${esc(url)}" style="display:inline-block;background:${color};color:${textOn(color)};text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">${esc(action)}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#5d6b74">${esc(note)}</p>
<p style="margin:0 0 20px;font-size:12px;color:#5d6b74;word-break:break-all">Si el botón no funciona, copia este enlace: ${esc(url)}</p></td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #dfe6e9;font-size:12px;color:#5d6b74">${isReset ? 'Si no pediste este cambio, ignora este correo: tu contraseña actual sigue funcionando.' : 'Si no esperabas este correo, puedes ignorarlo.'}</td></tr>
</table></td></tr></table></body></html>`
  const text = `${hello}\n\n${lead}\n\n${action}: ${url}\n\n${note}`
  return { subject, html, text }
}

// Recordatorio de las clases de hoy o de manana de una persona (alumno y/o
// profesor). classes: [{ title, componentName, programName, start, end,
// meetingUrl, instructorName, role: 'student'|'instructor' }]
export function classReminderEmail({ fullName, tenantName, brandColor, when, dateLabel, classes, appUrl, timezone }) {
  const zone = !timezone || timezone === 'America/Lima' ? 'hora de Perú' : `hora de ${timezone}`
  const org = tenantName || 'Fractal'
  const color = HEX.test(brandColor || '') ? brandColor : '#06425e'
  const isToday = when === 'today'
  const many = classes.length > 1
  const teaches = classes.every((c) => c.role === 'instructor')
  const first = classes[0]
  const time = (c) => (c.start ? `${c.start}${c.end ? `–${c.end}` : ''}` : 'Hora por confirmar')
  const dayWord = isToday ? 'hoy' : 'mañana'
  const subject = many
    ? `Recordatorio: tienes ${classes.length} clases ${dayWord} · ${org}`
    : `Recordatorio: ${teaches ? 'dictas' : 'tienes clase'} ${dayWord}${first.start ? ` a las ${first.start}` : ''} · ${first.componentName}`
  const hello = fullName ? `Hola ${fullName},` : 'Hola,'
  const lead = `${many ? `Estas son tus clases de ${dayWord}` : `Te recordamos tu clase de ${dayWord}`}, ${dateLabel}.`
  const rows = classes.map((c) => `<tr><td style="padding:12px 0;border-top:1px solid #dfe6e9;vertical-align:top;width:110px;font-weight:bold;color:#06425e;font-size:14px">${esc(time(c))}</td>
<td style="padding:12px 0 12px 12px;border-top:1px solid #dfe6e9;font-size:14px;line-height:1.45">
<div style="font-weight:bold;color:#17232d">${esc(c.title)}</div>
<div style="color:#5d6b74">${esc(c.componentName)} · ${esc(c.programName)}</div>
<div style="color:#5d6b74">${c.role === 'instructor' ? 'Tú dictas esta clase' : `Profesor: ${esc(c.instructorName || 'por asignar')}`}</div>
${c.meetingUrl ? `<div style="margin-top:6px"><a href="${esc(c.meetingUrl)}" style="color:#06425e;font-weight:bold;text-decoration:underline">Unirse a la clase</a></div>` : ''}
</td></tr>`).join('')
  const tip = teaches
    ? 'Al terminar, marca el tema como dictado y registra la asistencia en la app.'
    : 'Si no puedes asistir, avisa con anticipación pidiendo un permiso en la app.'
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f5f7f8;font-family:Arial,Helvetica,sans-serif;color:#17232d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #dfe6e9">
<tr><td style="padding:28px 28px 8px"><p style="margin:0 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#5d6b74">${esc(org)} · Training</p>
<h1 style="margin:0;font-size:22px;color:#06425e">${many ? `Tus clases de ${dayWord}` : `Tu clase de ${dayWord}`}</h1></td></tr>
<tr><td style="padding:12px 28px 4px;font-size:15px;line-height:1.55"><p style="margin:0 0 12px">${esc(hello)}</p><p style="margin:0 0 12px">${esc(lead)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
${appUrl ? `<p style="margin:20px 0 20px"><a href="${esc(appUrl)}" style="display:inline-block;background:${color};color:${textOn(color)};text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">Abrir la app</a></p>` : ''}
<p style="margin:0 0 20px;font-size:13px;color:#5d6b74">${esc(tip)}</p></td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #dfe6e9;font-size:12px;color:#5d6b74">Recibes este aviso porque estás inscrito o dictas en un programa de ${esc(org)}. Las horas están en ${esc(zone)}.</td></tr>
</table></td></tr></table></body></html>`
  const text = `${hello}\n\n${lead}\n\n${classes.map((c) => `- ${time(c)} · ${c.title} (${c.componentName}, ${c.programName})${c.role === 'instructor' ? ' · Tú dictas' : ''}${c.meetingUrl ? `\n  Unirse: ${c.meetingUrl}` : ''}`).join('\n')}\n\n${tip}${appUrl ? `\n\n${appUrl}` : ''}`
  return { subject, html, text }
}

// Cambio de fecha de una clase. kind: 'applied' (la clase ya se movio),
// 'proposed' (al profesor: confirmar la nueva fecha), 'rejected' (a los
// admins: el profesor no acepto). r: datos de sp_class_reschedule_get.
export function classRescheduleEmail({ kind, fullName, role, r, appUrl, oldLabel, newLabel }) {
  const org = r.tenant_name || 'Fractal'
  const color = HEX.test(r.brand_color || '') ? r.brand_color : '#06425e'
  const hello = fullName ? `Hola ${fullName},` : 'Hola,'
  const time = (s, e) => (s ? `${s}${e ? `–${e}` : ''}` : '')
  const oldWhen = `${oldLabel}${r.old_start ? `, ${time(r.old_start, r.old_end)}` : ''}`
  const newWhen = `${newLabel}, ${time(r.new_start, r.new_end)}`
  const title = kind === 'proposed' ? 'Confirma la nueva fecha de tu clase' : kind === 'rejected' ? 'El profesor no aceptó la nueva fecha' : 'Tu clase cambió de fecha'
  const subject = kind === 'proposed' ? `Confirma la nueva fecha: ${r.title} · ${org}` : kind === 'rejected' ? `Reprogramación no aceptada: ${r.title}` : `Clase reprogramada: ${r.title} → ${newLabel}`
  const lead = kind === 'proposed'
    ? `Se propone mover tu clase “${r.title}” a una nueva fecha que coincide con tu disponibilidad. Entra a la app para confirmarla o elegir otra.`
    : kind === 'rejected'
      ? `${r.instructor_name || 'El profesor'} no aceptó mover la clase “${r.title}”. Revisa la reprogramación en la app.`
      : role === 'instructor' ? `Tu clase “${r.title}” se movió a una nueva fecha.` : `La clase “${r.title}” se movió a una nueva fecha.`
  const reason = r.reason ? `<p style="margin:0 0 16px;font-size:14px;color:#5d6b74">Motivo: ${esc(r.reason)}</p>` : ''
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f5f7f8;font-family:Arial,Helvetica,sans-serif;color:#17232d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #dfe6e9">
<tr><td style="padding:28px 28px 8px"><p style="margin:0 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#5d6b74">${esc(org)} · Training</p>
<h1 style="margin:0;font-size:22px;color:#06425e">${esc(title)}</h1></td></tr>
<tr><td style="padding:12px 28px 4px;font-size:15px;line-height:1.55"><p style="margin:0 0 12px">${esc(hello)}</p><p style="margin:0 0 16px">${esc(lead)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px">
<tr><td style="padding:8px 0;color:#5d6b74;width:120px">Clase</td><td style="padding:8px 0;font-weight:bold">${esc(r.title)}<div style="font-weight:normal;color:#5d6b74">${esc(r.component_name)} · ${esc(r.program_name)}</div></td></tr>
<tr><td style="padding:8px 0;color:#5d6b74;border-top:1px solid #dfe6e9">Antes</td><td style="padding:8px 0;border-top:1px solid #dfe6e9;text-decoration:line-through;color:#5d6b74">${esc(oldWhen)}</td></tr>
<tr><td style="padding:8px 0;color:#5d6b74;border-top:1px solid #dfe6e9">${kind === 'applied' ? 'Nueva fecha' : 'Propuesta'}</td><td style="padding:8px 0;border-top:1px solid #dfe6e9;font-weight:bold;color:#06425e">${esc(newWhen)}</td></tr>
${r.instructor_name ? `<tr><td style="padding:8px 0;color:#5d6b74;border-top:1px solid #dfe6e9">Profesor</td><td style="padding:8px 0;border-top:1px solid #dfe6e9">${esc(r.instructor_name)}</td></tr>` : ''}
</table>${reason}
${kind === 'applied' && r.meeting_url ? `<p style="margin:0 0 12px"><a href="${esc(r.meeting_url)}" style="color:#06425e;font-weight:bold;text-decoration:underline">Enlace para unirse a la clase</a></p>` : ''}
${appUrl ? `<p style="margin:8px 0 20px"><a href="${esc(appUrl)}" style="display:inline-block;background:${color};color:${textOn(color)};text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">${kind === 'proposed' ? 'Confirmar en la app' : 'Abrir la app'}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #dfe6e9;font-size:12px;color:#5d6b74">Recibes este aviso porque participas en un programa de ${esc(org)}. Las horas están en hora de Perú.</td></tr>
</table></td></tr></table></body></html>`
  const text = `${hello}\n\n${lead}\n\nClase: ${r.title} (${r.component_name}, ${r.program_name})\nAntes: ${oldWhen}\n${kind === 'applied' ? 'Nueva fecha' : 'Propuesta'}: ${newWhen}${r.reason ? `\nMotivo: ${r.reason}` : ''}${appUrl ? `\n\n${appUrl}` : ''}`
  return { subject, html, text }
}
