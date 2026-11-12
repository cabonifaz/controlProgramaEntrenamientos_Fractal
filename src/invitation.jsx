import React, { useEffect, useState } from 'react'
import { saveSession } from './session'
import { readableTextOn } from './palette'

// Pagina publica del enlace de invitacion (/invitacion/<token>): la persona
// crea su propia contrasena y entra directo a la plataforma. Tambien sirve
// para crear una contrasena nueva si perdio el acceso (isReset).

export function getInvitationRoute() {
  const match = window.location.pathname.match(/^\/invitacion\/([A-Za-z0-9_-]{20,})\/?$/)
  return match ? { token: match[1] } : null
}

const INVITATION_ERRORS = {
  invitation_invalid: 'Este enlace no es válido o fue reemplazado por uno más nuevo. Pide a tu administrador que te genere otro.',
  invitation_used: 'Este enlace ya se usó. Si ya creaste tu contraseña, inicia sesión.',
  invitation_expired: 'Este enlace venció. Pide a tu administrador que te genere uno nuevo.',
  password_too_short: 'La contraseña debe tener al menos 8 caracteres.',
  password_too_long: 'La contraseña no puede superar los 128 caracteres.',
  password_needs_letters_and_numbers: 'La contraseña debe combinar letras y números.',
}

const roleKeyByCode = { student: 'student', instructor: 'instructor', tenant_admin: 'admin', super_admin: 'superAdmin' }

function passwordChecks(password) {
  return [
    ['Al menos 8 caracteres', password.length >= 8],
    ['Letras y números', /[a-zA-Z]/.test(password) && /\d/.test(password)],
  ]
}

export function InvitationApp({ token }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: '' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [logoFailed, setLogoFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/public/invitations/${token}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.message || 'invitation_invalid')
        return body.data
      })
      .then((data) => { if (!cancelled) setState({ status: 'ready', data, error: '' }) })
      .catch((err) => { if (!cancelled) setState({ status: 'error', data: null, error: err.message }) })
    return () => { cancelled = true }
  }, [token])

  const data = state.data
  const brand = data?.tenant?.brandColor || '#087fb8'
  const checks = passwordChecks(password)
  const mismatch = confirm.length > 0 && confirm !== password

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!checks.every(([, ok]) => ok)) return setFormError('La contraseña no cumple los requisitos.')
    if (password !== confirm) return setFormError('Las contraseñas no coinciden.')
    setSaving(true)
    try {
      const res = await fetch(`/api/public/invitations/${token}/accept`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message || 'invitation_invalid')

      // Entra directo con la contrasena recien creada.
      const login = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: body.data.email, password }),
      })
      const session = await login.json().catch(() => ({}))
      const role = roleKeyByCode[session.user?.roleCode]
      if (login.ok && role) saveSession({ role, token: session.token, profile: session.user }, true)
      window.location.replace('/')
    } catch (err) {
      setFormError(INVITATION_ERRORS[err.message] || 'No se pudo guardar la contraseña. Inténtalo de nuevo.')
      setSaving(false)
    }
  }

  return (
    <main className="invite-shell" style={{ '--brand': brand, '--on-brand': readableTextOn(brand) }}>
      <section className="invite-card">
        <div className="invite-brand">
          {/* Con logo basta el logo; sin logo, inicial + nombre. */}
          {data?.tenant?.logoUrl && !logoFailed
            ? <img src={data.tenant.logoUrl} alt={data.tenant.name} onError={() => setLogoFailed(true)} />
            : <><span className="invite-brand-mark">{(data?.tenant?.name || 'F').slice(0, 1)}</span><strong>{data?.tenant?.name || 'Fractal Training'}</strong></>}
        </div>

        {state.status === 'loading' && <p className="muted">Cargando…</p>}

        {state.status === 'error' && (
          <div className="invite-message">
            <h1>No pudimos abrir tu invitación</h1>
            <p>{INVITATION_ERRORS[state.error] || INVITATION_ERRORS.invitation_invalid}</p>
            <a className="invite-link" href={data?.tenant?.slug ? `/t/${data.tenant.slug}` : '/'}>Ir al inicio de sesión</a>
          </div>
        )}

        {state.status === 'ready' && (
          <form onSubmit={handleSubmit} noValidate>
            <p className="invite-kicker">{data.isReset ? 'Nueva contraseña' : 'Te damos la bienvenida'}</p>
            <h1>{data.isReset ? `Hola, ${data.fullName}` : `¡Hola, ${data.fullName}!`}</h1>
            <p className="muted">
              {data.isReset
                ? 'Crea una contraseña nueva para tu cuenta.'
                : `Te invitaron como ${data.roleLabel.toLowerCase()}. Crea tu contraseña para entrar a la plataforma.`}
            </p>
            <label className="invite-field">Correo
              <input value={data.email} readOnly />
            </label>
            <div className="invite-field">
              <label htmlFor="invite-password">Contraseña</label>
              <span className="invite-password">
                <input id="invite-password" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-describedby="invite-checks" autoFocus />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={show}>{show ? 'Ocultar' : 'Mostrar'}</button>
              </span>
            </div>
            <ul className="invite-checks" id="invite-checks" aria-live="polite">
              {checks.map(([label, ok]) => <li key={label} className={ok ? 'ok' : ''}>{ok ? '✓' : '○'} {label}</li>)}
            </ul>
            <div className="invite-field">
              <label htmlFor="invite-confirm">Repite la contraseña</label>
              <input id="invite-confirm" type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" aria-invalid={mismatch} />
            </div>
            {mismatch && <p className="invite-error">Las contraseñas no coinciden.</p>}
            {formError && <p className="invite-error">{formError}</p>}
            <button className="invite-submit" disabled={saving}>{saving ? 'Guardando…' : data.isReset ? 'Guardar y entrar' : 'Crear contraseña y entrar'}</button>
          </form>
        )}
      </section>
    </main>
  )
}
