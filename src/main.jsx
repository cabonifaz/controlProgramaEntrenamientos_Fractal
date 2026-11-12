import React, { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeftRight, Bell, BookOpenText, Route, PanelLeftClose, PanelLeftOpen, Pin, CalendarCog, LifeBuoy, CalendarDays, CalendarX2, Clock, ClipboardCheck, GraduationCap, LayoutDashboard, Smile, LogOut, Menu, Settings2, ShieldCheck, SquareKanban, UserRound, Users, X } from 'lucide-react'
import { AlertsPanel, ChangePasswordPanel, HolidaysPanel, InstructorClassesPanel, LeaveRequestsPanel, PreEnrollmentsPanel, ProgramsPanel, RealDashboard, ReportsPanel, TenantsPanel, UsersPanel } from './admin.jsx'
import { ProgressPanel } from './progress.jsx'
import { StudentAttendanceView, StudentSchedulePanel, StudentTopicsOverview } from './student.jsx'
import { PROFILE_PHOTO_EVENT, StudentDirectoryPanel, StudentProfilePanel } from './profile.jsx'
import { SatisfactionPanel } from './satisfaction.jsx'
import { AbsencesPanel } from './indicators.jsx'
import { MyAvailabilityPanel, SchedulePlannerPanel } from './schedules.jsx'
import { ReportButton, SupportPanel } from './support.jsx'
import { GuideTour, HelpPanel, ScreenGuideButton, screenGuideSteps, useFirstUseGuide } from './help.jsx'
import { InstructorAttendanceOverview, InstructorSyllabusPanel } from './instructor.jsx'
import { NextClassBar } from './classroom.jsx'
import { MaterialJobsIndicator } from './aiMaterial.jsx'
import { InductionAdminPanel, MyInductionPanel } from './induction.jsx'
import { AdminHomePanel } from './adminHome.jsx'
import { CourseCatalogPanel, STUDENT_MODE_REFRESH_EVENT, STUDENT_MODE_REQUEST_EVENT } from './courses.jsx'
import { getPublicProgramRoute, PublicProgramApp } from './public.jsx'
import { getInvitationRoute, InvitationApp } from './invitation.jsx'
import { apiRequest } from './api'
import { clearSession, loadActiveSection, loadSession, saveActiveSection, saveSession, sessionIsRemembered, SESSION_EXPIRED_EVENT } from './session'
import './styles.css'

const roles = {
  student: { label: 'Talento', name: 'Sofia Ramirez', subtitle: 'Frontend Foundations · Cohorte 2026', icon: Users },
  instructor: { label: 'Instructor', name: 'Carlos Mendoza', subtitle: 'Arquitectura y Backend', icon: ClipboardCheck },
  admin: { label: 'Admin de tenant', name: 'Valentina Ruiz', subtitle: 'Mi organización', icon: ShieldCheck },
  superAdmin: { label: 'Super ADMIN', name: 'Cris Bonifaz', subtitle: 'Control global de tenants', icon: Settings2 },
}


const SIDEBAR_KEY = 'fractal-sidebar-mode'
const PROFILE_NAV = new Set(['Cursos', 'Mi perfil', 'Mis alumnos', 'Alumnos', 'Satisfacción', 'Inasistencias', 'Horarios', 'Mi disponibilidad', 'Soporte', 'Ayuda', 'Inducción', 'Mi inducción'])
const SUPER_ADMIN_EXTRA_NAV = new Set(['Calendario'])

const roleKeyByCode = { student: 'student', instructor: 'instructor', tenant_admin: 'admin', super_admin: 'superAdmin' }

const ADMIN_PANEL_BY_NAV = { Inicio: AdminHomePanel, Avance: ProgressPanel, Tenants: TenantsPanel, Usuarios: UsersPanel, Programas: ProgramsPanel, Inscripciones: PreEnrollmentsPanel, Calendario: HolidaysPanel, Horarios: SchedulePlannerPanel, Cursos: CourseCatalogPanel, 'Inducción': InductionAdminPanel, Alumnos: StudentDirectoryPanel, 'Satisfacción': SatisfactionPanel, Inasistencias: AbsencesPanel, Permisos: LeaveRequestsPanel, Alertas: AlertsPanel, Ayuda: HelpPanel, Soporte: SupportPanel, Reportes: ReportsPanel, Configuracion: ChangePasswordPanel }
const INSTRUCTOR_PANEL_BY_NAV = { Inicio: RealDashboard, Avance: ProgressPanel, 'Mis clases': InstructorClassesPanel, Temarios: InstructorSyllabusPanel, Asistencia: InstructorAttendanceOverview, 'Mis alumnos': StudentDirectoryPanel, 'Mi disponibilidad': MyAvailabilityPanel, Cursos: CourseCatalogPanel, Permisos: LeaveRequestsPanel, Alertas: AlertsPanel, Ayuda: HelpPanel, Soporte: SupportPanel, 'Mi cuenta': ChangePasswordPanel }
const STUDENT_PANEL_BY_NAV = { Inicio: RealDashboard, Avance: ProgressPanel, 'Mi horario': StudentSchedulePanel, 'Mis temas': StudentTopicsOverview, 'Mi inducción': MyInductionPanel, Permisos: LeaveRequestsPanel, Asistencia: StudentAttendanceView, Alertas: AlertsPanel, 'Mi perfil': StudentProfilePanel, Ayuda: HelpPanel, Soporte: SupportPanel, 'Mi cuenta': ChangePasswordPanel }
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
  const [sidebarMode, setSidebarModeState] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) || 'expanded' } catch { return 'expanded' }
  })
  function setSidebarMode(mode) {
    setSidebarModeState(mode)
    setMenuOpen(false)
    try { localStorage.setItem(SIDEBAR_KEY, mode) } catch { /* sin almacenamiento */ }
  }
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
  // Alertas sin leer para el punto rojo de la campana (se recalcula al cambiar de seccion).
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [alertsTick, setAlertsTick] = useState(0)
  useEffect(() => {
    if (!sessionToken) return
    apiRequest('/api/alerts', { token: sessionToken }).then(({ data }) => setUnreadAlerts((data || []).filter((a) => a.status_code === 'open' && !a.read_at).length)).catch(() => {})
  }, [sessionToken, active, alertsTick])
  // Guia de primer uso (una vez por usuario) y su navegacion entre secciones.
  const guide = useFirstUseGuide(session)
  // Guia de la pantalla actual (boton Guia); 'general' = recorrido completo.
  const [screenGuide, setScreenGuide] = useState(null)
  const navigateGuide = useCallback((section) => { saveActiveSection(section); setNavParams(null); setActiveState(section) }, [])
  const [photoUrl, setPhotoUrl] = useState(null)
  const [tenantName, setTenantName] = useState(null)
  useEffect(() => {
    setPhotoUrl(null)
    setTenantName(null)
    if (!sessionToken) return undefined
    apiRequest('/api/me/profile', { token: sessionToken }).then(({ data }) => {
      setTenantName(data?.tenantName || null)
      if (session?.profile?.roleCode === 'student') setPhotoUrl(data?.photoUrl || null)
    }).catch(() => {})
    const onChange = (e) => setPhotoUrl(e.detail || null)
    window.addEventListener(PROFILE_PHOTO_EVENT, onChange)
    return () => window.removeEventListener(PROFILE_PHOTO_EVENT, onChange)
  }, [sessionToken])
  useEffect(() => {
    if (sessionToken) apiRequest('/api/auth/me', { token: sessionToken }).catch(() => {})
  }, [sessionToken])
  // Modo alumno: profesores y admins inscritos como alumnos cursan con la vista de alumno.
  const [studentMode, setStudentMode] = useState({ available: false, active: false })
  const [switching, setSwitching] = useState(false)
  useEffect(() => {
    setStudentMode({ available: false, active: false })
    if (!sessionToken || (session?.role === 'student' && !session?.baseRole)) return
    const refresh = () => apiRequest('/api/auth/student-mode', { token: sessionToken }).then(({ data }) => setStudentMode(data)).catch(() => {})
    refresh()
    window.addEventListener(STUDENT_MODE_REFRESH_EVENT, refresh)
    return () => window.removeEventListener(STUDENT_MODE_REFRESH_EVENT, refresh)
  }, [sessionToken])
  useEffect(() => {
    const request = () => switchStudentMode(true)
    window.addEventListener(STUDENT_MODE_REQUEST_EVENT, request)
    return () => window.removeEventListener(STUDENT_MODE_REQUEST_EVENT, request)
  })
  async function switchStudentMode(on) {
    if (switching) return
    setSwitching(true)
    try {
      const body = await apiRequest('/api/auth/student-mode', { method: 'POST', token: session.token, body: { on } })
      const next = on
        ? { role: 'student', token: body.token, profile: { ...session.profile, ...body.user }, baseRole: session.role, baseProfile: session.profile }
        : { role: session.baseRole, token: body.token, profile: session.baseProfile }
      saveSession(next, sessionIsRemembered())
      setActive('Inicio')
      setSession(next)
    } catch (err) {
      window.alert(err.message)
    } finally {
      setSwitching(false)
    }
  }

  if (!session) return <LoginGate onLogin={handleLogin} />
  const role = session.role
  const account = roles[role]
  const displayName = session.profile?.fullName || account.name
  const tenantLogoUrl = session.profile?.tenantLogoUrl || null
  const brandMark = tenantLogoUrl
    ? <img src={tenantLogoUrl} alt="Logo" className="logo-mark logo-mark-image" />
    : <div className="logo-mark">F</div>
  const baseNav = role === 'student' ? ['Inicio', 'Mi horario', 'Mis temas', 'Mi inducción', 'Asistencia', 'Permisos', 'Alertas', 'Mi perfil', 'Ayuda', 'Soporte', 'Mi cuenta'] : role === 'instructor' ? ['Inicio', 'Mis clases', 'Temarios', 'Asistencia', 'Mis alumnos', 'Mi disponibilidad', 'Cursos', 'Permisos', 'Alertas', 'Ayuda', 'Soporte', 'Mi cuenta'] : role === 'superAdmin' ? ['Inicio', 'Tenants', 'Usuarios', 'Alumnos', 'Programas', 'Inducción', 'Calendario', 'Horarios', 'Cursos', 'Inscripciones', 'Satisfacción', 'Inasistencias', 'Permisos', 'Alertas', 'Ayuda', 'Soporte', 'Reportes', 'Configuracion'] : ['Inicio', 'Programas', 'Inducción', 'Inscripciones', 'Usuarios', 'Alumnos', 'Calendario', 'Horarios', 'Cursos', 'Satisfacción', 'Inasistencias', 'Permisos', 'Alertas', 'Ayuda', 'Soporte', 'Reportes', 'Configuracion']
  // "Avance" (kanban) va segundo para todos los roles; el resto conserva
  // el icono de la posicion que tenia antes de agregarlo.
  const nav = [baseNav[0], 'Avance', ...baseNav.slice(1)]
  const navIcon = (item) => {
    if (item === 'Avance') return <SquareKanban size={18} />
    if (item === 'Cursos') return <BookOpenText size={18} />
    if (item === 'Mi perfil') return <UserRound size={18} />
    if (item === 'Mis alumnos' || item === 'Alumnos') return <GraduationCap size={18} />
    if (item === 'Satisfacción') return <Smile size={18} />
    if (item === 'Inasistencias') return <CalendarX2 size={18} />
    if (item === 'Horarios') return <CalendarCog size={18} />
    if (item === 'Mi disponibilidad') return <Clock size={18} />
    if (item === 'Soporte') return <LifeBuoy size={18} />
    if (item === 'Ayuda') return <BookOpenText size={18} />
    if (item === 'Inducción' || item === 'Mi inducción') return <Route size={18} />
    // Las secciones agregadas despues no corren el icono de las demas.
    if (role === 'superAdmin' && SUPER_ADMIN_EXTRA_NAV.has(item)) return <CalendarDays size={18} />
    const i = baseNav.filter((x) => !PROFILE_NAV.has(x) && !(role === 'superAdmin' && SUPER_ADMIN_EXTRA_NAV.has(x))).indexOf(item)
    return i === 0 ? <LayoutDashboard size={18} /> : i === 1 ? <CalendarDays size={18} /> : i === 2 ? <ClipboardCheck size={18} /> : i === 3 ? <Users size={18} /> : i === 4 ? <Bell size={18} /> : <Settings2 size={18} />
  }
  const AdminPanel = SECTION_PANELS_BY_ROLE[role]?.[active] || null
  const orgLabel = role === 'superAdmin' ? 'Todos los tenants' : tenantName || 'Mi organización'
  return <div className={`app-shell sb-${sidebarMode}`}>{menuOpen && sidebarMode === 'hidden' && <button type="button" className="sb-backdrop" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}<aside className={menuOpen ? 'sidebar open' : 'sidebar'}><button className="close-menu" onClick={() => setMenuOpen(false)}><X size={20} /></button><div className="brand-lockup">{brandMark}<div><strong>fractal</strong><small>training OS</small></div></div><div className="tenant-switch"><span>ESPACIO ACTIVO</span><strong title={orgLabel}>{orgLabel}</strong></div><div className="sb-controls">{sidebarMode === 'hidden' ? <button type="button" className="sb-control" onClick={() => setSidebarMode('expanded')} title="Fijar el menú"><Pin size={16} aria-hidden="true" /><span className="nav-label">Fijar menú</span></button> : <button type="button" className="sb-control" onClick={() => setSidebarMode(sidebarMode === 'collapsed' ? 'expanded' : 'collapsed')} title={sidebarMode === 'collapsed' ? 'Expandir el menú' : 'Minimizar el menú'} aria-label={sidebarMode === 'collapsed' ? 'Expandir el menú' : 'Minimizar el menú'}>{sidebarMode === 'collapsed' ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}<span className="nav-label">Minimizar</span></button>}</div><nav>{nav.map((item) => <button data-nav={item} className={active === item ? 'nav-item active' : 'nav-item'} onClick={() => { setActive(item); setMenuOpen(false) }} key={item} title={item}>{navIcon(item)}<span className="nav-label">{item}</span></button>)}</nav><div className="sidebar-bottom"><button type="button" className="help-card" onClick={() => { setActive('Soporte'); setMenuOpen(false) }}><strong>¿Necesitas ayuda?</strong><span>Habla con soporte</span></button><button className="profile-mini" onClick={logout}>{photoUrl ? <img className="avatar avatar-photo" src={photoUrl} alt="" /> : <div className="avatar">{displayName.split(' ').map(x => x[0]).join('').slice(0, 2)}</div>}<div><strong>{displayName}</strong><small>{account.label}</small></div><LogOut size={16} /></button></div></aside><main className="main"><header className="topbar"><button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu /></button><button type="button" className="sb-toggle" onClick={() => (sidebarMode === 'hidden' ? setMenuOpen(true) : setSidebarMode('hidden'))} title={sidebarMode === 'hidden' ? 'Mostrar el menú' : 'Ocultar el menú'} aria-label={sidebarMode === 'hidden' ? 'Mostrar el menú' : 'Ocultar el menú'}>{sidebarMode === 'hidden' ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}</button><div className="crumb">{active} <span aria-hidden="true">/</span> {orgLabel}</div><div className="top-actions">{(role === 'admin' || role === 'superAdmin') && <MaterialJobsIndicator session={session} onFinished={() => setAlertsTick((n) => n + 1)} />}{(studentMode.available || session.baseRole) && <button type="button" className={session.baseRole ? 'mode-switch on' : 'mode-switch'} onClick={() => switchStudentMode(!session.baseRole)} disabled={switching} aria-label={session.baseRole ? 'Volver a mi rol' : 'Modo alumno'} title={session.baseRole ? 'Volver a tu rol' : 'Cursar como alumno los programas en que estás inscrito'}><ArrowLeftRight size={16} aria-hidden="true" /><span>{session.baseRole ? 'Volver a mi rol' : 'Modo alumno'}</span></button>}<ScreenGuideButton onOpen={() => setScreenGuide(screenGuideSteps(active, role) || 'general')} /><ReportButton session={session} section={active} /><button type="button" className="icon-button" onClick={() => setActive('Alertas')} aria-label={unreadAlerts ? `Alertas: ${unreadAlerts} sin leer` : 'Alertas'} title="Alertas"><Bell size={19} />{unreadAlerts > 0 && <i />}</button>{photoUrl ? <img className="avatar avatar-photo" src={photoUrl} alt="" /> : <div className="avatar">{displayName.split(' ').map(x => x[0]).join('').slice(0, 2)}</div>}</div></header>{session.baseRole && <div className="student-mode-bar" role="status"><GraduationCap size={16} aria-hidden="true" /><span>Estás cursando como <strong>alumno</strong>. Tu rol de {roles[roleKeyByCode[session.baseProfile?.roleCode]]?.label || 'origen'} sigue intacto.</span><button type="button" className="btn-mini" onClick={() => switchStudentMode(false)} disabled={switching}>Volver a mi rol</button></div>}{AdminPanel ? <div className="content">{(role === 'student' || (role === 'instructor' && active !== 'Inicio')) && <NextClassBar session={session} refreshKey={active} navigate={setActive} />}<AdminPanel session={session} navigate={setActive} navParams={navParams} /></div> : <div className="content"><p className="muted">Esta sección no está disponible para tu rol.</p></div>}
  </main>{guide.open && <GuideTour role={role} onNavigate={navigateGuide} onClose={guide.close} />}{!guide.open && screenGuide && <GuideTour key={active} role={role} steps={screenGuide === 'general' ? undefined : screenGuide} onNavigate={navigateGuide} onClose={() => setScreenGuide(null)} />}</div>
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