// Correo transaccional con Resend (https://resend.com). Nunca rompe el flujo
// que lo llama: si no esta configurado o falla, devuelve { sent: false }.
//
// MAIL_MODE:
//   off      -> no envia nada (por defecto).
//   redirect -> todo va a MAIL_REDIRECT_TO, con el destinatario real en el
//               asunto. Es el modo de staging: con datos reales de produccion
//               nadie recibe correos de prueba. Sin MAIL_REDIRECT_TO no envia.
//   live     -> envia a los destinatarios reales (produccion).
// MAIL_FROM: remitente de un dominio verificado en Resend.

const RESEND_URL = 'https://api.resend.com/emails'

const mode = () => (process.env.MAIL_MODE || 'off').trim().toLowerCase()

export function mailEnabled() {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return false
  const m = mode()
  return m === 'live' || (m === 'redirect' && Boolean(process.env.MAIL_REDIRECT_TO))
}

export async function sendMail({ to, subject, html, text }) {
  if (!to || !mailEnabled()) return { sent: false, reason: 'disabled' }
  const redirect = mode() === 'redirect'
  const body = {
    from: process.env.MAIL_FROM,
    to: [redirect ? process.env.MAIL_REDIRECT_TO : to],
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
    return { sent: true, redirected: redirect }
  } catch (err) {
    console.error('[mail] no se pudo enviar:', err.message)
    return { sent: false, reason: 'network_error' }
  }
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const HEX = /^#[0-9a-f]{6}$/i

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
<p style="margin:0 0 24px"><a href="${esc(url)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">${esc(action)}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#5d6b74">${esc(note)}</p>
<p style="margin:0 0 20px;font-size:12px;color:#5d6b74;word-break:break-all">Si el botón no funciona, copia este enlace: ${esc(url)}</p></td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #dfe6e9;font-size:12px;color:#5d6b74">${isReset ? 'Si no pediste este cambio, ignora este correo: tu contraseña actual sigue funcionando.' : 'Si no esperabas este correo, puedes ignorarlo.'}</td></tr>
</table></td></tr></table></body></html>`
  const text = `${hello}\n\n${lead}\n\n${action}: ${url}\n\n${note}`
  return { subject, html, text }
}
