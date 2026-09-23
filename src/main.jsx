import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Bell, CalendarDays, ChevronDown, ClipboardCheck, LayoutDashboard, LogOut, Menu, Settings2, ShieldCheck, Users, X } from 'lucide-react'
import { AlertsPanel, ChangePasswordPanel, HolidaysPanel, InstructorClassesPanel, LeaveRequestsPanel, ProgramsPanel, RealDashboard, ReportsPanel, StudentAttendancePanel, TenantsPanel, UsersPanel } from './admin.jsx'
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

const roleCodeByKey = { student: 'student', instructor: 'instructor', admin: 'tenant_admin', superAdmin: 'super_admin' }

const ADMIN_PANEL_BY_NAV = { Tenants: TenantsPanel, Usuarios: UsersPanel, Programas: ProgramsPanel, Calendario: HolidaysPanel, Permisos: LeaveRequestsPanel, Alertas: AlertsPanel, Reportes: ReportsPanel, Configuracion: ChangePasswordPanel }
const INSTRUCTOR_PANEL_BY_NAV = { Inicio: RealDashboard, 'Mis clases': InstructorClassesPanel, Temarios: InstructorClassesPanel, Asistencia: InstructorClassesPanel, Alertas: AlertsPanel, 'Mi cuenta': ChangePasswordPanel }
const STUDENT_PANEL_BY_NAV = { Inicio: RealDashboard, Permisos: LeaveRequestsPanel, Asistencia: StudentAttendancePanel, Alertas: AlertsPanel, 'Mi cuenta': ChangePasswordPanel }
const SECTION_PANELS_BY_ROLE = { admin: ADMIN_PANEL_BY_NAV, superAdmin: ADMIN_PANEL_BY_NAV, instructor: INSTRUCTOR_PANEL_BY_NAV, student: STUDENT_PANEL_BY_NAV }

function Login({ onLogin }) {
  const [role, setRole] = useState('student')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const current = roles[role]

  async function handleSubmit(e) {
    e.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: roleCodeByKey[role] }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(body.message || 'No se pudo iniciar sesion')
        return
      }
      onLogin({ role, token: body.token, profile: body.user })
    } catch {
      setError('No se pudo conectar con el servidor')
    } finally {
      setLoading(false)
    }
  }

  return <main className="login-shell"><section className="login-art"><div className="logo-mark">F</div><p className="kicker">FRACTAL · TRAINING OS</p><h1>Aprender. Aplicar.<br /><em>Transformar.</em></h1><p className="art-copy">El espacio operativo donde cada talento convierte conocimiento en resultados visibles.</p><div className="art-foot"><span>01</span><span className="line" /><span>Control de entrenamiento</span></div></section><section className="login-panel"><form className="login-form" onSubmit={handleSubmit}><div className="mobile-logo logo-mark">F</div><p className="kicker">Bienvenido de nuevo</p><h2>Ingresa a tu espacio</h2><p className="muted">Selecciona tu tipo de acceso para continuar.</p><div className="role-tabs">{Object.entries(roles).map(([key, item]) => <button type="button" className={role === key ? 'role-tab active' : 'role-tab'} onClick={() => setRole(key)} key={key}>{item.label}</button>)}</div><label>Correo corporativo<input type="email" placeholder="tu@fractal.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Contraseña<div className="password"><input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required /><span>Mostrar</span></div></label><div className="form-row"><label className="check"><input type="checkbox" defaultChecked /> Recordarme</label><a href="#forgot">¿Olvidaste tu contraseña?</a></div>{error && <p className="form-error">{error}</p>}<button type="submit" className="primary full" disabled={loading}>{loading ? 'Ingresando…' : <>Entrar como {current.label.toLowerCase()} <span>→</span></>}</button><p className="login-note">Acceso seguro · Tu información está protegida</p></form></section></main>
}

function App() {
  const [session, setSession] = useState(null)
  const [active, setActive] = useState('Inicio')
  const [menuOpen, setMenuOpen] = useState(false)
  if (!session) return <Login onLogin={setSession} />
  const role = session.role
  const account = roles[role]
  const dashboard = data[role]
  const displayName = session.profile?.fullName || account.name
  const nav = role === 'student' ? ['Inicio', 'Mi horario', 'Mis temas', 'Asistencia', 'Permisos', 'Alertas', 'Mi cuenta'] : role === 'instructor' ? ['Inicio', 'Mis clases', 'Temarios', 'Asistencia', 'Alertas', 'Reportes', 'Mi cuenta'] : role === 'superAdmin' ? ['Inicio', 'Tenants', 'Usuarios', 'Programas', 'Permisos', 'Alertas', 'Reportes', 'Configuracion'] : ['Inicio', 'Programas', 'Usuarios', 'Calendario', 'Permisos', 'Alertas', 'Reportes', 'Configuracion']
  const AdminPanel = SECTION_PANELS_BY_ROLE[role]?.[active] || null
  return <div className="app-shell"><aside className={menuOpen ? 'sidebar open' : 'sidebar'}><button className="close-menu" onClick={() => setMenuOpen(false)}><X size={20} /></button><div className="brand-lockup"><div className="logo-mark">F</div><div><strong>fractal</strong><small>training OS</small></div></div><div className="tenant-switch"><span>ESPACIO ACTIVO</span><strong>{role === 'superAdmin' ? 'Todos los tenants' : 'Fractal Colombia'}</strong><ChevronDown size={16} /></div><nav>{nav.map((item, i) => <button className={active === item ? 'nav-item active' : 'nav-item'} onClick={() => { setActive(item); setMenuOpen(false) }} key={item}>{i === 0 ? <LayoutDashboard size={18} /> : i === 1 ? <CalendarDays size={18} /> : i === 2 ? <ClipboardCheck size={18} /> : i === 3 ? <Users size={18} /> : i === 4 ? <Bell size={18} /> : <Settings2 size={18} />}{item}{item === 'Reportes' && <span className="nav-badge">3</span>}</button>)}</nav><div className="sidebar-bottom"><div className="help-card"><strong>¿Necesitas ayuda?</strong><span>Habla con soporte</span></div><button className="profile-mini" onClick={() => setSession(null)}><div className="avatar">{displayName.split(' ').map(x => x[0]).join('').slice(0, 2)}</div><div><strong>{displayName}</strong><small>{account.label}</small></div><LogOut size={16} /></button></div></aside><main className="main"><header className="topbar"><button className="menu-button" onClick={() => setMenuOpen(true)}><Menu /></button><div className="crumb">{active} <span>/</span> {account.subtitle}</div><div className="top-actions"><button className="icon-button"><Bell size={19} /><i /></button><div className="avatar">{displayName.split(' ').map(x => x[0]).join('').slice(0, 2)}</div></div></header>{AdminPanel ? <div className="content"><AdminPanel session={session} /></div> : <div className="content"><div className="welcome"><div><p className="kicker">{dashboard.eyebrow}</p><h1>{dashboard.greeting}</h1><p className="muted">Aqui tienes lo importante para mantener tu programa en movimiento.</p></div><button className="secondary"><CalendarDays size={17} /> Ver calendario</button></div><div className="metrics">{dashboard.metrics.map(([title, value, note, type]) => <article className="metric" key={title}><div className="metric-head"><span>{title}</span><span className={`metric-dot ${type}`} /></div><strong>{value}</strong><small>{note}</small>{type === 'progress' && <div className="meter"><span /></div>}</article>)}</div><section className="section-head"><div><p className="kicker">Actividad reciente</p><h2>{role === 'student' ? 'Tu proximo paso' : 'Lo que necesita tu atencion'}</h2></div><button className="text-button">Ver todo <span>→</span></button></section><div className="workspace-grid"><section className="schedule panel"><div className="panel-head"><div><h3>{role === 'student' ? 'Proximas sesiones' : 'Agenda de hoy'}</h3><p className="muted">Semana del 21 al 27 de septiembre</p></div><button className="dots">•••</button></div><div className="topic-list">{dashboard.topics.map(([time, title, detail, status]) => <div className="topic" key={title}><div className="time">{time.split(' · ')[0]}<strong>{time.split(' · ')[1]}</strong></div><div className="topic-bar" /><div className="topic-info"><strong>{title}</strong><span>{detail}</span></div><span className={`status ${status === 'En vivo' || status === 'En progreso' ? 'live' : status === 'Atender' || status === 'Revisar' ? 'alert' : ''}`}>{status}</span></div>)}</div></section><section className="pulse panel"><div className="panel-head"><div><h3>Salud del programa</h3><p className="muted">Actualizado hace 12 minutos</p></div><span className="healthy">Estable</span></div><div className="ring"><div><strong>{role === 'student' ? '92' : role === 'instructor' ? '88' : '91'}<small>%</small></strong><span>asistencia</span></div></div><div className="legend"><span><i className="dot green" />Al dia <b>72%</b></span><span><i className="dot yellow" />En riesgo <b>19%</b></span><span><i className="dot red" />Atrasados <b>9%</b></span></div></section></div><section className="quick-actions"><div><p className="kicker">Acciones rapidas</p><h2>Que quieres hacer?</h2></div><div className="action-row"><button><ClipboardCheck size={20} /><strong>{role === 'student' ? 'Solicitar permiso' : 'Registrar asistencia'}</strong><span>→</span></button><button><CalendarDays size={20} /><strong>{role === 'student' ? 'Ver mis temarios' : 'Programar una clase'}</strong><span>→</span></button><button><Users size={20} /><strong>{role === 'admin' || role === 'superAdmin' ? 'Gestionar usuarios' : 'Ver mi grupo'}</strong><span>→</span></button></div></section></div>}
  </main></div>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)