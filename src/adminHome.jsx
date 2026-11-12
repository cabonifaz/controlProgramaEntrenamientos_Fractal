import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BookOpen, Building2, CalendarClock, CalendarDays, CheckCircle2, ClipboardCheck, GraduationCap, Inbox, LifeBuoy, UserCog, Users } from 'lucide-react'
import { apiRequest } from './api'
import { ErrorNote } from './admin.jsx'
import { formatDay } from './progress.jsx'

// Inicio del admin y del super admin con datos reales (antes era una
// maqueta con numeros de ejemplo). Cada indicador lleva a su seccion.
const longDate = () => { const d = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }); return d.charAt(0).toUpperCase() + d.slice(1) }
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export function AdminHomePanel({ session, navigate }) {
  const { token, profile } = session
  const isSuperAdmin = profile?.roleCode === 'super_admin'
  const [tenantId, setTenantId] = useState('')
  const [tenants, setTenants] = useState([])
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSuperAdmin) return
    apiRequest('/api/tenants', { token }).then(({ data: list }) => setTenants(list || [])).catch(() => {})
  }, [isSuperAdmin, token])

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError('')
    apiRequest(`/api/admin/dashboard${tenantId ? `?tenantId=${tenantId}` : ''}`, { token })
      .then(({ data: d }) => { if (!cancelled) setData(d) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [token, tenantId])

  const s = data?.summary
  const go = (section) => navigate?.(section)
  const metrics = s ? [
    ...(isSuperAdmin && !tenantId ? [{ label: 'Tenants activos', value: s.tenants_active, icon: Building2, section: 'Tenants' }] : []),
    { label: 'Programas activos', value: s.programs_active, icon: BookOpen, section: 'Programas' },
    { label: 'Alumnos activos', value: s.students_active, note: 'inscritos en programas activos', icon: GraduationCap, section: 'Alumnos' },
    { label: 'Profesores', value: s.instructors_active, icon: Users, section: 'Usuarios' },
    { label: 'Clases esta semana', value: s.classes_this_week, note: s.classes_today ? `${plural(s.classes_today, 'clase', 'clases')} hoy` : 'ninguna hoy', icon: CalendarDays, section: 'Avance' },
    { label: 'Asistencia (30 días)', value: s.attendance_rate_30d === null ? '—' : `${s.attendance_rate_30d}%`, note: s.attendance_rate_30d === null ? 'aún sin registros' : 'presentes y tardanzas', icon: ClipboardCheck, section: 'Inasistencias' },
  ] : []
  const attention = s ? [
    { n: s.topics_overdue, text: (n) => `${plural(n, 'tema', 'temas')} con fecha pasada sin marcar como dictado`, section: 'Avance', icon: CalendarClock },
    { n: s.attendance_missing, text: (n) => `${plural(n, 'clase dictada', 'clases dictadas')} sin asistencia registrada`, section: 'Avance', icon: ClipboardCheck },
    { n: s.groups_without_instructor, text: (n) => `${plural(n, 'grupo', 'grupos')} sin profesor asignado`, section: 'Horarios', icon: UserCog },
    { n: s.leave_pending, text: (n) => `${plural(n, 'permiso', 'permisos')} por aprobar`, section: 'Permisos', icon: Inbox },
    { n: s.pre_enrollments_pending, text: (n) => `${plural(n, 'preinscripción', 'preinscripciones')} por confirmar`, section: 'Inscripciones', icon: GraduationCap },
    { n: s.tickets_open, text: (n) => `${plural(n, 'reporte de soporte abierto', 'reportes de soporte abiertos')}`, section: 'Soporte', icon: LifeBuoy },
  ].filter((a) => a.n > 0) : []
  const days = useMemo(() => {
    const map = new Map()
    for (const c of data?.agenda || []) { if (!map.has(c.date)) map.set(c.date, []); map.get(c.date).push(c) }
    return [...map.entries()]
  }, [data])

  return (
    <div className="admin-wrap ah-wrap">
      <section className="panel ah-head">
        <div>
          <p className="kicker">{isSuperAdmin ? 'Vista global' : 'Operación del tenant'}</p>
          <h3>Hola, {profile?.fullName}</h3>
          <p className="muted ah-date">{longDate()}</p>
        </div>
        {isSuperAdmin && tenants.length > 0 && (
          <label className="pf-select"><span className="sr-only">Tenant</span>
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">Todos los tenants</option>
              {tenants.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
            </select>
          </label>
        )}
      </section>
      <ErrorNote message={error} />
      {!data ? !error && <p className="muted">Cargando…</p> : (
        <>
          <div className="ah-metrics">
            {metrics.map((m) => (
              <button key={m.label} type="button" className="ah-metric" onClick={() => go(m.section)}>
                <span className="ah-metric-label"><m.icon size={16} aria-hidden="true" /> {m.label}</span>
                <strong>{m.value ?? 0}</strong>
                {m.note && <small>{m.note}</small>}
              </button>
            ))}
          </div>
          <div className="ah-grid">
            <section className="panel">
              <h3>Requiere tu atención</h3>
              {!attention.length ? (
                <p className="ah-ok"><CheckCircle2 size={16} aria-hidden="true" /> Todo al día: no hay pendientes.</p>
              ) : (
                <ul className="ah-attention">
                  {attention.map((a) => (
                    <li key={a.section + a.n}>
                      <button type="button" onClick={() => go(a.section)}>
                        <a.icon size={16} aria-hidden="true" /><span>{a.text(a.n)}</span><span aria-hidden="true">→</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel">
              <h3>Próximas clases <small className="muted">· 7 días</small></h3>
              {!days.length ? <p className="muted">No hay clases programadas en los próximos 7 días.</p> : days.map(([day, list]) => (
                <div key={day} className="ah-day">
                  <h4>{formatDay(day)}</h4>
                  <ul>
                    {list.map((c) => (
                      <li key={c.topicId}>
                        <span className="ah-time">{c.start ? `${c.start}–${c.end}` : 'Sin hora'}</span>
                        <span className="ah-class"><strong>{c.componentName}</strong> <span className="muted">· {c.groupName}{isSuperAdmin && !tenantId ? ` · ${c.tenantName}` : ''}</span><small className="muted">{c.title}</small></span>
                        <span className="ah-who">{c.instructorName || <span className="ah-warn"><AlertTriangle size={13} aria-hidden="true" /> Sin profesor</span>}<small className="muted">{plural(c.enrolled, 'alumno', 'alumnos')}</small></span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
