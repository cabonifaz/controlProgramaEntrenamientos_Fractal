import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Bell, CalendarCog, LifeBuoy, CalendarDays, CalendarX2, Clock, ChevronDown, ClipboardCheck, GraduationCap, LayoutDashboard, Smile, LogOut, Menu, Settings2, ShieldCheck, SquareKanban, UserRound, Users, X } from 'lucide-react'
import { AlertsPanel, ChangePasswordPanel, HolidaysPanel, InstructorClassesPanel, LeaveRequestsPanel, PreEnrollmentsPanel, ProgramsPanel, RealDashboard, ReportsPanel, TenantsPanel, UsersPanel } from './admin.jsx'
import { ProgressPanel } from './progress.jsx'
import { StudentAttendanceView, StudentSchedulePanel, StudentTopicsOverview } from './student.jsx'
import { PROFILE_PHOTO_EVENT, StudentDirectoryPanel, StudentProfilePanel } from './profile.jsx'
import { SatisfactionPanel } from './satisfaction.jsx'
import { AbsencesPanel } from './indicators.jsx'
import { MyAvailabilityPanel, SchedulePlannerPanel } from './schedules.jsx'
import { ReportButton, SupportPanel } from './support.jsx'
import { getPublicProgramRoute, PublicProgramApp } from './public.jsx'
import { getInvitationRoute, InvitationApp } from './invitation.jsx'
import { apiRequest } from './api'
import { clearSession, loadActiveSection, loadSession, saveActiveSection, saveSession, SESSION_EXPIRED_EVENT } from './session'
import './styles.css'

const roles = {
  student: { label: 'Talento', name: 'Sofia Ramirez', subtitle: 'Frontend Foundations · Cohorte 2026', icon: Users },
  instructor: { label: 'Instructor', name: 'Carlos Mendoza', subtitle: 'Arquitectura y Backend', icon: ClipboardCheck },
  admin: { label: 'Admin de tenant', name: 'Valentina Ruiz', subtitle: 'Fractal Colombia', icon: ShieldCheck },
  superAdmin: { label: 'Super ADMIN', name: 'Cris Bonifaz', subtitle: 'Control global de tenants', icon: Settings2 },
}

const data = {
  student: { greeting: 'Buenos dias, Sofia', eyebrow: 'Tu ruta de aprendizaje', metrics: [['Progreso del programa', '68%', '+8% esta semana', 'progress'], ['Asistencia', '92%', '2 ausencias justificadas', 'good'], ['Temas por tomar', '12', '3 esta semana', 'blue']], topics: [['Hoy · 09:00', 'Patrones de arquitectura', 'Arquitectura', 'En vivo'], ['Mañana · 14:00', 'Stored procedures y auditoria', 'Base de datos', 'Programado'], ['Jue 24 · 09:00', 'Diseño de APIs seguras', 'Backend', 'Programado']] },
  instructor: { greeting: 'Buenos dias, Carlos', eyebrow: 'Panel del instructor', metrics: [['Clases esta semana', '8', '6 completadas', 'blue'], ['Asistencia del grupo', '88%', '-4% vs. semana anterior', 'warning'], ['Temas atrasados', '2', 'Requieren seguimiento', 'danger']], topics: [['Hoy · 09:00', 'Patrones de arquitectura', 'Grupo A · 18 talentos', 'En progreso'], ['Hoy · 15:00', 'Revision de reto Nivel 1', 'Grupo B · 12 talentos', 'Pendiente'], ['Jue 24 · 09:00', 'Diseño de APIs seguras', 'Grupo A · 18 talentos', 'Programado']] },
  admin: { greeting: 'Buenos dias, Valentina', eyebrow: 'Operacion del tenant', metrics: [['Talentos activos', '84', '+12 este mes', 'blue'], ['Asistencia promedio', '91%', '+3% vs. mes anterior', 'good'], ['Alertas abiertas', '7', '3 requieren atencion', 'warning']], topics: [['Alerta · Hace 2h', 'Grupo B sin clase registrada', 'Instructor: Andres Pardo', 'Revisar'], ['Alerta · Ayer', '4 talentos con 3+ inasistencias', 'Programa: Full-stack 2026', 'Atender'], ['Actividad · Hoy', 'Nuevo programa creado', 'Programa: Vibe Coding', 'Ver detalle']] },
  superAdmin: { greeting: 'Buenos dias, Cris', eyebrow: 'Vista global', metrics: [['Tenants activos', '6', '+1 este mes', 'blue'], ['Programas activos', '18', 'En todos los tenants', 'good'], ['Salud de la plataforma', '99.8%', 'Todos los servicios estables', 'progress']], topics: [['Tenant nuevo', 'Fractal Peru', 'Configuracion inicial pendiente', 'Configurar'], ['Actividad global', '18 programas activos', '142 instructores asignados', 'Ver detalle'], ['Seguridad', '2 invitaciones pendientes', 'Requieren aprobacion', 'Revisar']] },
}

const PROFILE_NAV = new Set(['Mi perfil', 'Mis alumnos', 'Alumnos', 'Satisfacción', 'Inasistencias', 'Horarios', 'Mi disponibilidad', 'Soporte'])
const SUPER_ADMIN_EXTRA_NAV = new Set(['Calendario'])

const roleKeyByCode = { student: 'student', instructor: 'instructor', tenant_admin: 'admin', super_admin: 'superAdmin' }

const ADMIN_PANEL_BY_NAV = { Avance: ProgressPanel, Tenants: TenantsPanel, Usuarios: UsersPanel, Programas: ProgramsPanel, Inscripciones: PreEnrollmentsPanel, Calendario: HolidaysPanel, Horarios: SchedulePlannerPanel, Alumnos: StudentDirectoryPanel, 'Satisfacción': SatisfactionPanel, Inasistencias: AbsencesPanel, Permisos: LeaveRequestsPanel, Alertas: AlertsPanel, Soporte: SupportPanel, Reportes: ReportsPanel, Configuracion: ChangePasswordPanel }
const INSTRUCTOR_PANEL_BY_NAV = { Inicio: RealDashboard, Avance: ProgressPanel, 'Mis clases': InstructorClassesPanel, Temarios: InstructorClassesPanel, Asistencia: InstructorClassesPanel, 'Mis alumnos': StudentDirectoryPanel, 'Mi disponibilidad': MyAvailabilityPanel, Permisos: LeaveRequestsPanel, Alertas: AlertsPanel, Soporte: SupportPanel, 'Mi cuenta': ChangePasswordPanel }
const STUDENT_PANEL_BY_NAV = { Inicio: RealDashboard, Avance: ProgressPanel, 'Mi horario': StudentSchedulePanel, 'Mis temas': StudentTopicsOverview, Permisos: LeaveRequestsPanel, Asistencia: StudentAttendanceView, Alertas: AlertsPanel, 'Mi perfil': StudentProfilePanel, Soporte: SupportPanel, 'Mi cuenta': ChangePasswordPanel }
const SECTION_PANELS_BY_ROLE = { admin: ADMIN_PANEL_BY_NAV, superAdmin: ADMIN_PANEL_BY_NAV, instructor: INSTRUCTOR_PANEL_BY_NAV, student: STUDENT_PANEL_BY_NAV }

function getTenantSlugFromPath() {
  const match = window.location.pathname.match(/^\/t\/([a-z0-9-]+)\/?$/i)
  return match ? match[1] : null
}

const LOGIN_ERRORS = {
  'Invalid credentials': 'Correo o contraseña incorrectos.',
  invitation_pending: 'Todavía no creaste tu contraseña. Abre el enlace de invitación que te compartieron (si venció, pide uno nuevo a tu administrador).',
  'User or tenant is inactive': 'Tu cuenta o tu organización está inactiva.',
  'Account temporarily locked, try again later': 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.',
}

function Login({ onLogin, tenantSlug, branding }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  // "Olvide mi clave": la solicitud le llega al administrador.
  const [forgot, setForgot] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  async function handleForgot(e) {
    e.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      const response = await fetch('/api/public/password-reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(body.message === 'too_many_requests' ? 'Demasiadas solicitudes desde esta red. Inténtalo en una hora.' : 'Revisa el correo ingresado.')
        return
      }
      setForgotSent(true)
    } catch {
      setError('No se pudo conectar con el servidor')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tenantSlug ? { email, password, tenantSlug } : { email, password }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(LOGIN_ERRORS[body.message] || body.message || 'No se pudo iniciar sesion')
        return
      }
      const role = roleKeyByCode[body.user?.roleCode]
      if (!role) {
        setError('Rol de cuenta no reconocido')
        return
      }
      onLogin({ role, token: body.token, profile: body.user }, remember)
    } catch {
      setError('No se pudo conectar con el servidor')
    } finally {
      setLoading(false)
    }
  }

  const brandColor = branding?.brandColor || null
  const brandStyle = brandColor ? { '--orange': brandColor } : undefined
  const brandName = branding?.name || null
  const logoMark = branding?.logoUrl
    ? <img src={branding.logoUrl} alt={brandName || 'Logo'} className="logo-mark logo-mark-image" />
    : <div className="logo-mark">F</div>

  return <main className="login-shell" style={brandStyle}><section className="login-art"><div className="logo-mark">{branding?.logoUrl ? <img src={branding.logoUrl} alt={brandName || 'Logo'} className="logo-mark-image" /> : 'F'}</div><p className="kicker">{brandName ? brandName.toUpperCase() : 'FRACTAL'} · TRAINING OS</p><h1>Aprender. Aplicar.<br /><em>Transformar.</em></h1><p className="art-copy">El espacio operativo donde cada talento convierte conocimiento en resultados visibles.</p><div className="art-foot"><span>01</span><span className="line" /><span>Control de entrenamiento</span></div></section><section className="login-panel">{forgot ? <form className="login-form" onSubmit={handleForgot}><div className="mobile-logo logo-mark">{logoMark}</div><p className="kicker">Recuperar acceso</p><h2>¿Olvidaste tu contraseña?</h2>{forgotSent ? <><p className="temp-password-box" role="status">Listo. Si <b>{email}</b> está registrado, tu administrador recibió la solicitud y te compartirá un enlace personal para crear una nueva contraseña.</p><button type="button" className="primary full" onClick={() => { setForgot(false); setForgotSent(false) }}>Volver a ingresar</button></> : <><p className="muted">Escribe tu correo. Tu administrador recibirá la solicitud y te enviará un enlace de un solo uso para crear una nueva contraseña.</p><label>Correo corporativo<input type="email" placeholder="tu@fractal.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>{error && <p className="form-error">{error}</p>}<button type="submit" className="primary full" disabled={loading}>{loading ? 'Enviando…' : 'Enviar solicitud'}</button><button type="button" className="text-button login-back" onClick={() => { setForgot(false); setError('') }}>← Volver a ingresar</button></>}</form> : <form className="login-form" onSubmit={handleSubmit}><div className="mobile-logo logo-mark">{logoMark}</div><p className="kicker">Bienvenido de nuevo</p><h2>Ingresa a tu espacio{brandName ? ` · ${brandName}` : ''}</h2><p className="muted">Tu rol se determina automáticamente al autenticarte.</p><label>Correo corporativo<input type="email" placeholder="tu@fractal.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Contraseña<div className="password"><input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required /><button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div></label><div className="form-row"><label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Recordarme</label><button type="button" className="text-button forgot-link" onClick={() => { setForgot(true); setError('') }}>¿Olvidaste tu contraseña?</button></div>{error && <p className="form-error">{error}</p>}<button type="submit" className="primary full" disabled={loading}>{loading ? 'Ingresando…' : <>Entrar <span>→</span></>}</button><p className="login-note">Acceso seguro · Tu información está protegida</p></form>}</section></main>
}

function LoginGate({ onLogin }) {
  const tenantSlug = getTenantSlugFromPath()
  const [status, setStatus] = useState(tenantSlug ? 'loading' : 'ready')
  const [branding, setBranding] = useState(null)

  useEffect(() => {
    if (!tenantSlug) return
    let cancelled = false
    fetch(`/api/public/tenants/${tenantSlug}/branding`)
      .then((res) => res.ok ? res.json() : Promise.reject(res))
      .then((body) => { if (!cancelled) { setBranding(body.data); setStatus('ready') } })
      .catch(() => { if (!cancelled) setStatus('not_found') })
    return () => { cancelled = true }
  }, [tenantSlug])

  if (status === 'loading') return <main className="login-shell"><section className="login-panel"><p className="muted">Cargando…</p></section></main>
  if (status === 'not_found') return <main className="login-shell"><section className="login-panel"><div className="login-form"><h2>Tenant no encontrado</h2><p className="muted">Este link de acceso no corresponde a ningún tenant activo. Verifica la URL con tu administrador.</p></div></section></main>

  return <Login onLogin={onLogin} tenantSlug={tenantSlug} branding={branding} />
}

function App() {
  // La sesion se guarda en el navegador: recargar no la cierra.
  const [session, setSession] = useState(() => loadSession())
  const [active, setActiveState] = useState(() => (loadSession() && loadActiveSection()) || 'Inicio')
  const [menuOpen, setMenuOpen] = useState(false)
  // Parametros al saltar de una seccion a otra (p. ej. Tenants -> Usuarios
  // de ese tenant). Se limpian al navegar desde el menu.
  const [navParams, setNavParams] = useState(null)

  function setActive(section, params = null) {
    saveActiveSection(section)
    setNavParams(params)
    setActiveState(section)
  }

  function handleLogin(newSession, remember) {
    saveSession(newSession, remember)
    setActive('Inicio')
    setSession(newSession)
  }

  function logout() {
    clearSession()
    setActiveState('Inicio')
    setSession(null)
  }

  // El servidor rechazo el token (vencido o invalido): de vuelta al login.
  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, logout)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, logout)
  }, [])

  // Sesion restaurada del navegador: se confirma con el servidor al cargar
  // (si la rechaza, apiRequest dispara SESSION_EXPIRED_EVENT).
  const sessionToken = session?.token
  const [photoUrl, setPhotoUrl] = useState(null)
  useEffect(() => {
    setPhotoUrl(null)
    if (!sessionToken || session?.profile?.roleCode !== 'student') return undefined
    apiRequest('/api/me/profile', { token: sessionToken }).then(({ data }) => setPhotoUrl(data?.photoUrl || null)).catch(() => {})
    const onChange = (e) => setPhotoUrl(e.detail || null)
    window.addEventListener(PROFILE_PHOTO_EVENT, onChange)
    return () => window.removeEventListener(PROFILE_PHOTO_EVENT, onChange)
  }, [sessionToken])
  useEffect(() => {
    if (sessionToken) apiRequest('/api/auth/me', { token: sessionToken }).catch(() => {})
  }, [sessionToken])

  if (!session) return <LoginGate onLogin={handleLogin} />
  const role = session.role
  const account = roles[role]
  const dashboard = data[role]
  const displayName = session.profile?.fullName || account.name
  const tenantLogoUrl = session.profile?.tenantLogoUrl || null
  const brandMark = tenantLogoUrl
    ? <img src={tenantLogoUrl} alt="Logo" className="logo-mark logo-mark-image" />
    : <div className="logo-mark">F</div>
  const baseNav = role === 'student' ? ['Inicio', 'Mi horario', 'Mis temas', 'Asistencia', 'Permisos', 'Alertas', 'Mi perfil', 'Soporte', 'Mi cuenta'] : role === 'instructor' ? ['Inicio', 'Mis clases', 'Temarios', 'Asistencia', 'Mis alumnos', 'Mi disponibilidad', 'Permisos', 'Alertas', 'Soporte', 'Reportes', 'Mi cuenta'] : role === 'superAdmin' ? ['Inicio', 'Tenants', 'Usuarios', 'Alumnos', 'Programas', 'Calendario', 'Horarios', 'Inscripciones', 'Satisfacción', 'Inasistencias', 'Permisos', 'Alertas', 'Soporte', 'Reportes', 'Configuracion'] : ['Inicio', 'Programas', 'Inscripciones', 'Usuarios', 'Alumnos', 'Calendario', 'Horarios', 'Satisfacción', 'Inasistencias', 'Permisos', 'Alertas', 'Soporte', 'Reportes', 'Configuracion']
  // "Avance" (kanban) va segundo para todos los roles; el resto conserva
  // el icono de la posicion que tenia antes de agregarlo.
  const nav = [baseNav[0], 'Avance', ...baseNav.slice(1)]
  const navIcon = (item) => {
    if (item === 'Avance') return <SquareKanban size={18} />
    if (item === 'Mi perfil') return <UserRound size={18} />
    if (item === 'Mis alumnos' || item === 'Alumnos') return <GraduationCap size={18} />
    if (item === 'Satisfacción') return <Smile size={18} />
    if (item === 'Inasistencias') return <CalendarX2 size={18} />
    if (item === 'Horarios') return <CalendarCog size={18} />
    if (item === 'Mi disponibilidad') return <Clock size={18} />
    if (item === 'Soporte') return <LifeBuoy size={18} />
    // Las secciones agregadas despues no corren el icono de las demas.
    if (role === 'superAdmin' && SUPER_ADMIN_EXTRA_NAV.has(item)) return <CalendarDays size={18} />
    const i = baseNav.filter((x) => !PROFILE_NAV.has(x) && !(role === 'superAdmin' && SUPER_ADMIN_EXTRA_NAV.has(x))).indexOf(item)
    return i === 0 ? <LayoutDashboard size={18} /> : i === 1 ? <CalendarDays size={18} /> : i === 2 ? <ClipboardCheck size={18} /> : i === 3 ? <Users size={18} /> : i === 4 ? <Bell size={18} /> : <Settings2 size={18} />
  }
  const AdminPanel = SECTION_PANELS_BY_ROLE[role]?.[active] || null
  return <div className="app-shell"><aside className={menuOpen ? 'sidebar open' : 'sidebar'}><button className="close-menu" onClick={() => setMenuOpen(false)}><X size={20} /></button><div className="brand-lockup">{brandMark}<div><strong>fractal</strong><small>training OS</small></div></div><div className="tenant-switch"><span>ESPACIO ACTIVO</span><strong>{role === 'superAdmin' ? 'Todos los tenants' : 'Fractal Colombia'}</strong><ChevronDown size={16} /></div><nav>{nav.map((item) => <button className={active === item ? 'nav-item active' : 'nav-item'} onClick={() => { setActive(item); setMenuOpen(false) }} key={item}>{navIcon(item)}{item}{item === 'Reportes' && <span className="nav-badge">3</span>}</button>)}</nav><div className="sidebar-bottom"><button type="button" className="help-card" onClick={() => { setActive('Soporte'); setMenuOpen(false) }}><strong>¿Necesitas ayuda?</strong><span>Habla con soporte</span></button><button className="profile-mini" onClick={logout}>{photoUrl ? <img className="avatar avatar-photo" src={photoUrl} alt="" /> : <div className="avatar">{displayName.split(' ').map(x => x[0]).join('').slice(0, 2)}</div>}<div><strong>{displayName}</strong><small>{account.label}</small></div><LogOut size={16} /></button></div></aside><main className="main"><header className="topbar"><button className="menu-button" onClick={() => setMenuOpen(true)}><Menu /></button><div className="crumb">{active} <span>/</span> {account.subtitle}</div><div className="top-actions"><ReportButton session={session} section={active} /><button className="icon-button"><Bell size={19} /><i /></button>{photoUrl ? <img className="avatar avatar-photo" src={photoUrl} alt="" /> : <div className="avatar">{displayName.split(' ').map(x => x[0]).join('').slice(0, 2)}</div>}</div></header>{AdminPanel ? <div className="content"><AdminPanel session={session} navigate={setActive} navParams={navParams} /></div> : <div className="content"><div className="welcome"><div><p className="kicker">{dashboard.eyebrow}</p><h1>{dashboard.greeting}</h1><p className="muted">Aqui tienes lo importante para mantener tu programa en movimiento.</p></div><button className="secondary"><CalendarDays size={17} /> Ver calendario</button></div><div className="metrics">{dashboard.metrics.map(([title, value, note, type]) => <article className="metric" key={title}><div className="metric-head"><span>{title}</span><span className={`metric-dot ${type}`} /></div><strong>{value}</strong><small>{note}</small>{type === 'progress' && <div className="meter"><span /></div>}</article>)}</div><section className="section-head"><div><p className="kicker">Actividad reciente</p><h2>{role === 'student' ? 'Tu proximo paso' : 'Lo que necesita tu atencion'}</h2></div><button className="text-button">Ver todo <span>→</span></button></section><div className="workspace-grid"><section className="schedule panel"><div className="panel-head"><div><h3>{role === 'student' ? 'Proximas sesiones' : 'Agenda de hoy'}</h3><p className="muted">Semana del 21 al 27 de septiembre</p></div><button className="dots">•••</button></div><div className="topic-list">{dashboard.topics.map(([time, title, detail, status]) => <div className="topic" key={title}><div className="time">{time.split(' · ')[0]}<strong>{time.split(' · ')[1]}</strong></div><div className="topic-bar" /><div className="topic-info"><strong>{title}</strong><span>{detail}</span></div><span className={`status ${status === 'En vivo' || status === 'En progreso' ? 'live' : status === 'Atender' || status === 'Revisar' ? 'alert' : ''}`}>{status}</span></div>)}</div></section><section className="pulse panel"><div className="panel-head"><div><h3>Salud del programa</h3><p className="muted">Actualizado hace 12 minutos</p></div><span className="healthy">Estable</span></div><div className="ring"><div><strong>{role === 'student' ? '92' : role === 'instructor' ? '88' : '91'}<small>%</small></strong><span>asistencia</span></div></div><div className="legend"><span><i className="dot green" />Al dia <b>72%</b></span><span><i className="dot yellow" />En riesgo <b>19%</b></span><span><i className="dot red" />Atrasados <b>9%</b></span></div></section></div><section className="quick-actions"><div><p className="kicker">Acciones rapidas</p><h2>Que quieres hacer?</h2></div><div className="action-row"><button><ClipboardCheck size={20} /><strong>{role === 'student' ? 'Solicitar permiso' : 'Registrar asistencia'}</strong><span>→</span></button><button><CalendarDays size={20} /><strong>{role === 'student' ? 'Ver mis temarios' : 'Programar una clase'}</strong><span>→</span></button><button><Users size={20} /><strong>{role === 'admin' || role === 'superAdmin' ? 'Gestionar usuarios' : 'Ver mi grupo'}</strong><span>→</span></button></div></section></div>}
  </main></div>
}

// La web publica de un programa (/p/<tenant>/<programa>) no pasa por el login.
// Igual el enlace de invitacion (/invitacion/<token>), donde se crea la contrasena.
const publicProgramRoute = getPublicProgramRoute()
const invitationRoute = getInvitationRoute()
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {invitationRoute ? <InvitationApp {...invitationRoute} /> : publicProgramRoute ? <PublicProgramApp {...publicProgramRoute} /> : <App />}
  </React.StrictMode>
)