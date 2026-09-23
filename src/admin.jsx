import React, { useEffect, useState } from 'react'
import { apiRequest } from './api'

function useList(path, token) {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!path) return
    let cancelled = false
    setLoading(true)
    setError('')
    apiRequest(path, { token })
      .then((res) => { if (!cancelled) setItems(res.data || []) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [path, token, reloadKey])

  return { items, error, loading, reload: () => setReloadKey((k) => k + 1) }
}

function useCatalog(code, token) {
  const { items } = useList(`/api/catalogs/${code}`, token)
  return items
}

function ErrorNote({ message }) {
  if (!message) return null
  return <p className="form-error">{message}</p>
}

function StatusPill({ label }) {
  if (!label) return null
  return <span className="pill">{label}</span>
}

export function TenantsPanel({ session }) {
  const { token } = session
  const { items, error, loading, reload } = useList('/api/tenants', token)
  const [form, setForm] = useState({ name: '', slug: '', contactName: '', contactEmail: '', timezone: '' })
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      await apiRequest('/api/tenants', { method: 'POST', token, body: form })
      setForm({ name: '', slug: '', contactName: '', contactEmail: '', timezone: '' })
      reload()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleStatus(tenant) {
    const nextStatus = tenant.status_code === 'active' ? 'inactive' : 'active'
    try {
      await apiRequest(`/api/tenants/${tenant.id}/status`, { method: 'POST', token, body: { statusCode: nextStatus } })
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  return (
    <div className="admin-wrap">
      <section className="panel admin-form-panel">
        <h3>Nuevo tenant</h3>
        <form className="admin-form" onSubmit={handleCreate}>
          <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Slug<input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="fractal-peru" required /></label>
          <label>Contacto<input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></label>
          <label>Email de contacto<input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></label>
          <label>Zona horaria<input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="America/Lima" /></label>
          <ErrorNote message={formError} />
          <button className="primary" disabled={submitting}>{submitting ? 'Creando…' : 'Crear tenant'}</button>
        </form>
      </section>
      <section className="panel">
        <h3>Tenants</h3>
        <ErrorNote message={error} />
        {loading ? <p className="muted">Cargando…</p> : (
          <table className="admin-table">
            <thead><tr><th>Nombre</th><th>Slug</th><th>Estado</th><th>Contacto</th><th></th></tr></thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.slug}</td>
                  <td><StatusPill label={t.status_label} /></td>
                  <td>{t.contact_email || '—'}</td>
                  <td><button className="btn-mini" onClick={() => toggleStatus(t)}>{t.status_code === 'active' ? 'Desactivar' : 'Activar'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export function UsersPanel({ session }) {
  const { token, profile } = session
  const isSuperAdmin = profile.roleCode === 'super_admin'
  const { items, error, loading, reload } = useList('/api/users', token)
  const { items: tenants } = useList(isSuperAdmin ? '/api/tenants' : '', token)
  const [form, setForm] = useState({ fullName: '', email: '', password: '', roleCode: isSuperAdmin ? 'tenant_admin' : 'instructor', tenantId: '' })
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastTempPassword, setLastTempPassword] = useState(null)

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      await apiRequest('/api/users', {
        method: 'POST', token,
        body: { ...form, tenantId: isSuperAdmin ? (form.tenantId ? Number(form.tenantId) : null) : profile.tenantId },
      })
      setForm({ fullName: '', email: '', password: '', roleCode: isSuperAdmin ? 'tenant_admin' : 'instructor', tenantId: '' })
      reload()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleActive(user) {
    try {
      await apiRequest(`/api/users/${user.id}/active`, { method: 'POST', token, body: { isActive: !user.is_active } })
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  async function resetPassword(user) {
    try {
      const res = await apiRequest(`/api/admin/users/${user.id}/reset-password`, { method: 'POST', token })
      setLastTempPassword({ email: user.email, value: res.temporaryPassword })
    } catch (err) {
      setFormError(err.message)
    }
  }

  const roleOptions = isSuperAdmin ? ['tenant_admin', 'super_admin'] : ['instructor', 'student']

  return (
    <div className="admin-wrap">
      <section className="panel admin-form-panel">
        <h3>Nuevo usuario</h3>
        <form className="admin-form" onSubmit={handleCreate}>
          <label>Nombre completo<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label>
          <label>Correo<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Contraseña inicial<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required /></label>
          <label>Rol
            <select value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}>
              {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          {isSuperAdmin && form.roleCode === 'tenant_admin' && (
            <label>Tenant
              <select value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} required>
                <option value="">Selecciona…</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          <ErrorNote message={formError} />
          <button className="primary" disabled={submitting}>{submitting ? 'Creando…' : 'Crear usuario'}</button>
        </form>
        {lastTempPassword && (
          <p className="temp-password-box">
            Contraseña temporal para <strong>{lastTempPassword.email}</strong>: <code>{lastTempPassword.value}</code>
            <br />Compártela fuera del sistema; se pedirá cambiarla en el próximo ingreso.
          </p>
        )}
      </section>
      <section className="panel">
        <h3>Usuarios</h3>
        <ErrorNote message={error} />
        {loading ? <p className="muted">Cargando…</p> : (
          <table className="admin-table">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name}</td>
                  <td>{u.email}</td>
                  <td>{u.role_code}</td>
                  <td>{u.is_active ? 'Activo' : 'Inactivo'}</td>
                  <td className="row-actions">
                    <button className="btn-mini" onClick={() => toggleActive(u)}>{u.is_active ? 'Desactivar' : 'Activar'}</button>
                    <button className="btn-mini" onClick={() => resetPassword(u)}>Resetear clave</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function TopicsPanel({ session, component, onBack }) {
  const { token } = session
  const { items, error, loading, reload } = useList(`/api/components/${component.id}/topics`, token)
  const [form, setForm] = useState({ title: '', description: '', scheduledOn: '', durationMinutes: '' })
  const [formError, setFormError] = useState('')
  const topicStatuses = useCatalog('TOPIC_STATUS', token)

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    try {
      await apiRequest(`/api/components/${component.id}/topics`, {
        method: 'POST', token,
        body: { ...form, durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null },
      })
      setForm({ title: '', description: '', scheduledOn: '', durationMinutes: '' })
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  async function updateStatus(topic, statusCode) {
    try {
      await apiRequest(`/api/topics/${topic.id}/status`, {
        method: 'POST', token,
        body: { statusCode, actualDate: statusCode === 'completed' ? new Date().toISOString().slice(0, 10) : null },
      })
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  async function reschedule(topic, newDate) {
    if (!newDate) return
    try {
      await apiRequest(`/api/topics/${topic.id}/reschedule`, { method: 'POST', token, body: { newDate } })
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  return (
    <div className="admin-wrap">
      <button className="text-button crumb-back" onClick={onBack}>← Volver a {component.name}</button>
      <section className="panel admin-form-panel">
        <h3>Nuevo tema — {component.name}</h3>
        <form className="admin-form" onSubmit={handleCreate}>
          <label>Título<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
          <label>Descripción<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Fecha programada<input type="date" value={form.scheduledOn} onChange={(e) => setForm({ ...form, scheduledOn: e.target.value })} /></label>
          <label>Duración (min)<input type="number" min="0" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></label>
          <ErrorNote message={formError} />
          <button className="primary">Crear tema</button>
        </form>
      </section>
      <section className="panel">
        <h3>Temario</h3>
        <ErrorNote message={error} />
        {loading ? <p className="muted">Cargando…</p> : (
          <table className="admin-table">
            <thead><tr><th>Título</th><th>Programado</th><th>Estado</th><th>Actualizar</th><th>Reprogramar</th></tr></thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>{t.title}</td>
                  <td>{t.scheduled_on || '—'}</td>
                  <td><StatusPill label={t.status_label} /></td>
                  <td>
                    <select defaultValue="" onChange={(e) => { if (e.target.value) { updateStatus(t, e.target.value); e.target.value = '' } }}>
                      <option value="">Cambiar a…</option>
                      {topicStatuses.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                    </select>
                  </td>
                  <td><input type="date" onChange={(e) => reschedule(t, e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function ScheduleDaysPanel({ session, program }) {
  const { token } = session
  const { items, error, loading, reload } = useList(`/api/programs/${program.id}/schedule-days`, token)
  const [form, setForm] = useState({ weekday: '1', startTime: '09:00', endTime: '12:00' })
  const [formError, setFormError] = useState('')

  async function handleAdd(e) {
    e.preventDefault()
    setFormError('')
    try {
      await apiRequest(`/api/programs/${program.id}/schedule-days`, {
        method: 'POST', token, body: { weekday: Number(form.weekday), startTime: form.startTime, endTime: form.endTime },
      })
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  async function remove(weekday) {
    setFormError('')
    try {
      await apiRequest(`/api/programs/${program.id}/schedule-days/${weekday}`, { method: 'DELETE', token })
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  return (
    <section className="panel admin-form-panel">
      <h3>Horario base — {program.name}</h3>
      <p className="muted">Días y franja horaria en que se dictan clases. El generador automático de fechas del temario solo usa estos días.</p>
      <form className="admin-form" onSubmit={handleAdd}>
        <label>Día
          <select value={form.weekday} onChange={(e) => setForm({ ...form, weekday: e.target.value })}>
            {WEEKDAY_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
          </select>
        </label>
        <label>Hora inicio<input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required /></label>
        <label>Hora fin<input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required /></label>
        <ErrorNote message={formError || error} />
        <button className="primary">Agregar día</button>
      </form>
      {!loading && items.length > 0 && (
        <div className="schedule-day-pills">
          {items.map((d) => (
            <span className="pill schedule-day-pill" key={d.weekday}>
              {WEEKDAY_LABELS[d.weekday]} {d.start_time.slice(0, 5)}–{d.end_time.slice(0, 5)}
              <button className="pill-remove" onClick={() => remove(d.weekday)}>×</button>
            </span>
          ))}
        </div>
      )}
      {!loading && items.length === 0 && <p className="muted">Sin días configurados todavía: el generador automático no podrá crear fechas hasta que agregues al menos uno.</p>}
    </section>
  )
}

function ComponentsPanel({ session, program, onBack }) {
  const { token, profile } = session
  const { items, error, loading, reload } = useList(`/api/programs/${program.id}/components`, token)
  const { items: instructors } = useList(`/api/users?role=instructor`, token)
  const { items: students } = useList(`/api/users?role=student`, token)
  const [form, setForm] = useState({ name: '', description: '', sortOrder: 0, instructorId: '' })
  const [formError, setFormError] = useState('')
  const [selectedComponent, setSelectedComponent] = useState(null)
  const [enrollStudentId, setEnrollStudentId] = useState({})
  const [scheduleMessage, setScheduleMessage] = useState('')

  async function generateSchedule(component) {
    setFormError('')
    setScheduleMessage('')
    try {
      const res = await apiRequest(`/api/components/${component.id}/generate-schedule`, { method: 'POST', token, body: {} })
      setScheduleMessage(`${component.name}: ${res.data.topics_scheduled} tema(s) programado(s) automáticamente.`)
    } catch (err) {
      setFormError(err.message)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    try {
      await apiRequest(`/api/programs/${program.id}/components`, {
        method: 'POST', token,
        body: { ...form, instructorId: form.instructorId ? Number(form.instructorId) : null },
      })
      setForm({ name: '', description: '', sortOrder: 0, instructorId: '' })
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  async function assignInstructor(component, instructorId) {
    if (!instructorId) return
    try {
      await apiRequest(`/api/components/${component.id}/instructor`, { method: 'POST', token, body: { instructorId: Number(instructorId) } })
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  async function enrollStudent(component) {
    const studentId = enrollStudentId[component.id]
    if (!studentId) return
    try {
      await apiRequest(`/api/components/${component.id}/students`, { method: 'POST', token, body: { studentId: Number(studentId) } })
      setEnrollStudentId({ ...enrollStudentId, [component.id]: '' })
    } catch (err) {
      setFormError(err.message)
    }
  }

  if (selectedComponent) {
    return <TopicsPanel session={session} component={selectedComponent} onBack={() => setSelectedComponent(null)} />
  }

  return (
    <div className="admin-wrap">
      <button className="text-button crumb-back" onClick={onBack}>← Volver a programas</button>
      <ScheduleDaysPanel session={session} program={program} />
      <section className="panel admin-form-panel">
        <h3>Nuevo componente — {program.name}</h3>
        <form className="admin-form" onSubmit={handleCreate}>
          <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Descripción<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Orden<input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></label>
          <label>Instructor
            <select value={form.instructorId} onChange={(e) => setForm({ ...form, instructorId: e.target.value })}>
              <option value="">Sin asignar</option>
              {instructors.map((i) => <option key={i.id} value={i.id}>{i.full_name}</option>)}
            </select>
          </label>
          <ErrorNote message={formError} />
          <button className="primary">Crear componente</button>
        </form>
      </section>
      <section className="panel">
        <h3>Componentes</h3>
        <ErrorNote message={error || formError} />
        {scheduleMessage && <p className="temp-password-box">{scheduleMessage}</p>}
        {loading ? <p className="muted">Cargando…</p> : (
          <table className="admin-table">
            <thead><tr><th>Nombre</th><th>Instructor</th><th>Estado</th><th>Inscribir alumno</th><th>Calendario</th><th></th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <select value={c.instructor_id || ''} onChange={(e) => assignInstructor(c, e.target.value)}>
                      <option value="">Sin asignar</option>
                      {instructors.map((i) => <option key={i.id} value={i.id}>{i.full_name}</option>)}
                    </select>
                  </td>
                  <td><StatusPill label={c.status_label} /></td>
                  <td className="row-actions">
                    <select value={enrollStudentId[c.id] || ''} onChange={(e) => setEnrollStudentId({ ...enrollStudentId, [c.id]: e.target.value })}>
                      <option value="">Selecciona alumno…</option>
                      {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                    <button className="btn-mini" onClick={() => enrollStudent(c)}>Inscribir</button>
                  </td>
                  <td><button className="btn-mini" onClick={() => generateSchedule(c)}>Generar fechas automáticas</button></td>
                  <td><button className="btn-mini" onClick={() => setSelectedComponent(c)}>Ver temario</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export function ProgramsPanel({ session }) {
  const { token, profile } = session
  const isSuperAdmin = profile.roleCode === 'super_admin'
  const { items, error, loading, reload } = useList('/api/programs', token)
  const modalities = useCatalog('CLASS_MODALITY', token)
  const programStatuses = useCatalog('PROGRAM_STATUS', token)
  const [form, setForm] = useState({ name: '', description: '', cohort: '', modalityCode: '', startsOn: '', endsOn: '' })
  const [formError, setFormError] = useState('')
  const [selectedProgram, setSelectedProgram] = useState(null)

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    try {
      await apiRequest('/api/programs', { method: 'POST', token, body: form })
      setForm({ name: '', description: '', cohort: '', modalityCode: '', startsOn: '', endsOn: '' })
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  async function changeStatus(program, statusCode) {
    if (!statusCode) return
    try {
      await apiRequest(`/api/programs/${program.id}/status`, { method: 'POST', token, body: { statusCode } })
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  if (selectedProgram) {
    return <ComponentsPanel session={session} program={selectedProgram} onBack={() => setSelectedProgram(null)} />
  }

  return (
    <div className="admin-wrap">
      <section className="panel admin-form-panel">
        <h3>Nuevo programa</h3>
        <form className="admin-form" onSubmit={handleCreate}>
          <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Cohorte<input value={form.cohort} onChange={(e) => setForm({ ...form, cohort: e.target.value })} placeholder="2026-1" required /></label>
          <label>Descripción<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Modalidad
            <select value={form.modalityCode} onChange={(e) => setForm({ ...form, modalityCode: e.target.value })}>
              <option value="">Sin definir</option>
              {modalities.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
            </select>
          </label>
          <label>Inicio<input type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} /></label>
          <label>Fin<input type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} /></label>
          <ErrorNote message={formError} />
          <button className="primary">Crear programa</button>
        </form>
      </section>
      <section className="panel">
        <h3>Programas{isSuperAdmin ? ' (todos los tenants)' : ''}</h3>
        <ErrorNote message={error} />
        {loading ? <p className="muted">Cargando…</p> : (
          <table className="admin-table">
            <thead><tr><th>Nombre</th><th>Cohorte</th><th>Estado</th><th>Fechas</th><th></th></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.cohort}</td>
                  <td>
                    <select value={p.status_code} onChange={(e) => changeStatus(p, e.target.value)}>
                      {programStatuses.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                    </select>
                  </td>
                  <td>{p.starts_on || '—'} → {p.ends_on || '—'}</td>
                  <td><button className="btn-mini" onClick={() => setSelectedProgram(p)}>Ver componentes</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export function LeaveRequestsPanel({ session }) {
  const { token, profile } = session
  const isStudent = profile.roleCode === 'student'
  const { items, error, loading, reload } = useList('/api/leave-requests', token)
  const leaveTypes = useCatalog('LEAVE_TYPE', token)
  const [comments, setComments] = useState({})
  const [actionError, setActionError] = useState('')
  const [form, setForm] = useState({ startsOn: '', endsOn: '', reason: '', leaveTypeCode: '', evidenceUrl: '' })
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      await apiRequest('/api/leave-requests', { method: 'POST', token, body: form })
      setForm({ startsOn: '', endsOn: '', reason: '', leaveTypeCode: '', evidenceUrl: '' })
      reload()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function resolve(request, statusCode) {
    setActionError('')
    try {
      await apiRequest(`/api/leave-requests/${request.id}/resolve`, {
        method: 'POST', token, body: { statusCode, adminComments: comments[request.id] || null },
      })
      reload()
    } catch (err) {
      setActionError(err.message)
    }
  }

  async function cancel(request) {
    setActionError('')
    try {
      await apiRequest(`/api/leave-requests/${request.id}/cancel`, { method: 'POST', token })
      reload()
    } catch (err) {
      setActionError(err.message)
    }
  }

  return (
    <div className="admin-wrap">
      {isStudent && (
        <section className="panel admin-form-panel">
          <h3>Solicitar permiso</h3>
          <form className="admin-form" onSubmit={handleCreate}>
            <label>Desde<input type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} required /></label>
            <label>Hasta<input type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} required /></label>
            <label>Tipo
              <select value={form.leaveTypeCode} onChange={(e) => setForm({ ...form, leaveTypeCode: e.target.value })}>
                <option value="">Sin definir</option>
                {leaveTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </label>
            <label>Evidencia (link, opcional)<input value={form.evidenceUrl} onChange={(e) => setForm({ ...form, evidenceUrl: e.target.value })} placeholder="https://…" /></label>
            <label>Motivo<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required /></label>
            <ErrorNote message={formError} />
            <button className="primary" disabled={submitting}>{submitting ? 'Enviando…' : 'Enviar solicitud'}</button>
          </form>
        </section>
      )}
      <section className="panel">
        <h3>{isStudent ? 'Mis solicitudes' : 'Solicitudes de permiso'}</h3>
        {!isStudent && <p className="muted">La creación la hace el propio alumno; aquí se aprueba o rechaza. Sin correo: el alumno revisa el estado dentro de la app.</p>}
        <ErrorNote message={error || actionError} />
        {loading ? <p className="muted">Cargando…</p> : (
          <table className="admin-table">
            <thead><tr>{!isStudent && <th>Alumno</th>}<th>Fechas</th><th>Motivo</th><th>Estado</th><th>Comentario</th><th></th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  {!isStudent && <td>{r.student_name}</td>}
                  <td>{r.starts_on} → {r.ends_on}</td>
                  <td>{r.reason}</td>
                  <td><StatusPill label={r.status_label} /></td>
                  <td>
                    {!isStudent && r.status_code === 'pending' ? (
                      <input placeholder="Comentario (opcional)" value={comments[r.id] || ''} onChange={(e) => setComments({ ...comments, [r.id]: e.target.value })} />
                    ) : (r.admin_comments || '—')}
                  </td>
                  <td className="row-actions">
                    {!isStudent && r.status_code === 'pending' && (
                      <>
                        <button className="btn-mini" onClick={() => resolve(r, 'approved')}>Aprobar</button>
                        <button className="btn-mini" onClick={() => resolve(r, 'rejected')}>Rechazar</button>
                      </>
                    )}
                    {isStudent && r.status_code === 'pending' && (
                      <button className="btn-mini" onClick={() => cancel(r)}>Cancelar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export function HolidaysPanel({ session }) {
  const { token } = session
  const { items, error, loading, reload } = useList('/api/holidays', token)
  const types = useCatalog('HOLIDAY_TYPE', token)
  const [form, setForm] = useState({ holidayOn: '', name: '', typeCode: '' })
  const [formError, setFormError] = useState('')

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    try {
      await apiRequest('/api/holidays', { method: 'POST', token, body: form })
      setForm({ holidayOn: '', name: '', typeCode: '' })
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  return (
    <div className="admin-wrap">
      <section className="panel admin-form-panel">
        <h3>Nuevo feriado</h3>
        <form className="admin-form" onSubmit={handleCreate}>
          <label>Fecha<input type="date" value={form.holidayOn} onChange={(e) => setForm({ ...form, holidayOn: e.target.value })} required /></label>
          <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Tipo
            <select value={form.typeCode} onChange={(e) => setForm({ ...form, typeCode: e.target.value })}>
              <option value="">Sin definir</option>
              {types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </label>
          <ErrorNote message={formError} />
          <button className="primary">Crear feriado</button>
        </form>
      </section>
      <section className="panel">
        <h3>Feriados del calendario</h3>
        <p className="muted">Ningún tema puede programarse automáticamente en estas fechas; el procedimiento almacenado lo bloquea.</p>
        <ErrorNote message={error} />
        {loading ? <p className="muted">Cargando…</p> : (
          <table className="admin-table">
            <thead><tr><th>Fecha</th><th>Nombre</th><th>Tipo</th></tr></thead>
            <tbody>
              {items.map((h) => (
                <tr key={h.id}><td>{h.holiday_on}</td><td>{h.name}</td><td>{h.type_label || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function InstructorAttendancePanel({ session, topic, onBack }) {
  const { token } = session
  const { items, error, loading, reload } = useList(`/api/topics/${topic.id}/attendance`, token)
  const statuses = useCatalog('ATTENDANCE_STATUS', token)
  const reasons = useCatalog('ABSENCE_REASON', token)
  const [draft, setDraft] = useState({})
  const [actionError, setActionError] = useState('')

  function patch(studentId, fields) {
    setDraft((d) => ({ ...d, [studentId]: { ...d[studentId], ...fields } }))
  }

  async function save(row) {
    const statusCode = draft[row.student_id]?.statusCode ?? row.status_code
    if (!statusCode) { setActionError('Selecciona un estado antes de guardar'); return }
    setActionError('')
    try {
      await apiRequest(`/api/topics/${topic.id}/attendance`, {
        method: 'POST', token,
        body: {
          studentId: row.student_id, statusCode,
          reasonCode: draft[row.student_id]?.reasonCode ?? row.reason_code ?? null,
          observations: draft[row.student_id]?.observations ?? row.observations ?? null,
        },
      })
      reload()
    } catch (err) {
      setActionError(err.message)
    }
  }

  return (
    <div className="admin-wrap">
      <button className="text-button crumb-back" onClick={onBack}>← Volver al temario</button>
      <section className="panel">
        <h3>Asistencia — {topic.title}</h3>
        <p className="muted">{topic.scheduled_on ? `Programado: ${topic.scheduled_on}` : 'Sin fecha programada'}</p>
        <ErrorNote message={error || actionError} />
        {loading ? <p className="muted">Cargando…</p> : items.length === 0 ? <p className="muted">No hay alumnos inscritos en este componente todavía.</p> : (
          <table className="admin-table">
            <thead><tr><th>Alumno</th><th>Estado</th><th>Motivo</th><th>Observaciones</th><th></th></tr></thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.student_id}>
                  <td>{row.student_name}</td>
                  <td>
                    <select value={draft[row.student_id]?.statusCode ?? row.status_code ?? ''} onChange={(e) => patch(row.student_id, { statusCode: e.target.value })}>
                      <option value="">Sin marcar</option>
                      {statuses.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={draft[row.student_id]?.reasonCode ?? row.reason_code ?? ''} onChange={(e) => patch(row.student_id, { reasonCode: e.target.value })}>
                      <option value="">—</option>
                      {reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                    </select>
                  </td>
                  <td><input placeholder="Opcional" value={draft[row.student_id]?.observations ?? row.observations ?? ''} onChange={(e) => patch(row.student_id, { observations: e.target.value })} /></td>
                  <td><button className="btn-mini" onClick={() => save(row)}>Guardar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function InstructorTopicsPanel({ session, component, onBack }) {
  const { token } = session
  const { items, error, loading } = useList(`/api/components/${component.id}/topics`, token)
  const [selectedTopic, setSelectedTopic] = useState(null)

  if (selectedTopic) {
    return <InstructorAttendancePanel session={session} topic={selectedTopic} onBack={() => setSelectedTopic(null)} />
  }

  return (
    <div className="admin-wrap">
      <button className="text-button crumb-back" onClick={onBack}>← Volver a mis clases</button>
      <section className="panel">
        <h3>Temario — {component.name}</h3>
        <ErrorNote message={error} />
        {loading ? <p className="muted">Cargando…</p> : items.length === 0 ? <p className="muted">Este componente todavía no tiene temas.</p> : (
          <table className="admin-table">
            <thead><tr><th>Título</th><th>Programado</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>{t.title}</td>
                  <td>{t.scheduled_on || '—'}</td>
                  <td><StatusPill label={t.status_label} /></td>
                  <td><button className="btn-mini" onClick={() => setSelectedTopic(t)}>Tomar asistencia</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export function InstructorClassesPanel({ session }) {
  const { token } = session
  const { items, error, loading } = useList('/api/my/components', token)
  const [selectedComponent, setSelectedComponent] = useState(null)

  if (selectedComponent) {
    return <InstructorTopicsPanel session={session} component={selectedComponent} onBack={() => setSelectedComponent(null)} />
  }

  return (
    <div className="admin-wrap">
      <section className="panel">
        <h3>Mis componentes</h3>
        <ErrorNote message={error} />
        {loading ? <p className="muted">Cargando…</p> : items.length === 0 ? <p className="muted">Todavía no tienes componentes asignados.</p> : (
          <table className="admin-table">
            <thead><tr><th>Programa</th><th>Componente</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>{c.program_name} · {c.cohort}</td>
                  <td>{c.name}</td>
                  <td><StatusPill label={c.status_label} /></td>
                  <td><button className="btn-mini" onClick={() => setSelectedComponent(c)}>Ver temario</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export function StudentAttendancePanel({ session }) {
  const { token, profile } = session
  const { items, error, loading } = useList(`/api/students/${profile.id}/attendance`, token)

  return (
    <div className="admin-wrap">
      <section className="panel">
        <h3>Mi asistencia</h3>
        <ErrorNote message={error} />
        {loading ? <p className="muted">Cargando…</p> : items.length === 0 ? <p className="muted">Todavía no hay registros de asistencia.</p> : (
          <table className="admin-table">
            <thead><tr><th>Tema</th><th>Fecha</th><th>Estado</th><th>Motivo</th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>{a.topic_title}</td>
                  <td>{a.scheduled_on || '—'}</td>
                  <td><StatusPill label={a.status_label} /></td>
                  <td>{a.reason_label || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export function AlertsPanel({ session }) {
  const { token, profile } = session
  const isAdmin = profile.roleCode === 'super_admin' || profile.roleCode === 'tenant_admin'
  const { items, error, loading, reload } = useList('/api/alerts', token)
  const [detecting, setDetecting] = useState(false)
  const [detectMessage, setDetectMessage] = useState('')
  const [actionError, setActionError] = useState('')

  async function detect() {
    setDetecting(true)
    setDetectMessage('')
    setActionError('')
    try {
      const res = await apiRequest('/api/alerts/detect', { method: 'POST', token })
      setDetectMessage(`${res.data.alerts_created} alerta(s) nueva(s) detectada(s).`)
      reload()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setDetecting(false)
    }
  }

  async function markRead(alert) {
    setActionError('')
    try {
      await apiRequest(`/api/alerts/${alert.id}/read`, { method: 'POST', token })
      reload()
    } catch (err) {
      setActionError(err.message)
    }
  }

  return (
    <div className="admin-wrap">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Alertas</h3>
            <p className="muted">{isAdmin ? 'Generadas por el sistema a partir del estado actual (sin correo ni cron: se disparan bajo demanda).' : 'Alertas dirigidas a ti.'}</p>
          </div>
          {isAdmin && <button className="btn-mini" onClick={detect} disabled={detecting}>{detecting ? 'Detectando…' : 'Detectar alertas'}</button>}
        </div>
        {detectMessage && <p className="temp-password-box">{detectMessage}</p>}
        <ErrorNote message={error || actionError} />
        {loading ? <p className="muted">Cargando…</p> : items.length === 0 ? <p className="muted">No hay alertas por ahora.</p> : (
          <table className="admin-table">
            <thead><tr><th>Prioridad</th><th>Alerta</th><th>Generada</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td><span className={`pill priority-${a.priority_code}`}>{a.priority_label}</span></td>
                  <td><strong>{a.title}</strong><br /><span className="muted">{a.description}</span></td>
                  <td>{new Date(a.generated_at).toLocaleString()}</td>
                  <td><StatusPill label={a.status_label} /></td>
                  <td>{a.status_code === 'open' && <button className="btn-mini" onClick={() => markRead(a)}>Marcar leída</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

const REPORT_OPTIONS = [
  { key: 'attendance-by-program', label: 'Asistencia por programa' },
  { key: 'attendance-by-component', label: 'Asistencia por componente' },
  { key: 'attendance-by-student', label: 'Asistencia por alumno' },
  { key: 'absences-unjustified', label: 'Inasistencias no justificadas' },
  { key: 'absences-justified', label: 'Inasistencias justificadas' },
  { key: 'program-progress', label: 'Avance por programa' },
  { key: 'component-progress', label: 'Avance por componente (grupo)' },
  { key: 'instructor-compliance', label: 'Cumplimiento de instructores' },
  { key: 'delayed-topics', label: 'Temas atrasados' },
  { key: 'ahead-topics', label: 'Temas adelantados' },
  { key: 'leave-requests-summary', label: 'Resumen de solicitudes de permiso' },
  { key: 'period-comparison', label: 'Comparativo por periodo' },
]

const REPORT_COLUMN_LABELS = {
  program_id: 'ID Programa', program_name: 'Programa', component_id: 'ID Componente', component_name: 'Componente',
  student_id: 'ID Alumno', student_name: 'Alumno', instructor_id: 'ID Instructor', instructor_name: 'Instructor',
  tenant_id: 'Tenant', total_records: 'Registros', present_count: 'Presentes', absent_count: 'Ausentes',
  justified_count: 'Justificadas', attendance_rate: '% Asistencia', status_label: 'Estado', status_code: 'Código',
  total_topics: 'Temas totales', completed_topics: 'Temas completados', delayed_topics: 'Temas atrasados',
  progress_pct: '% Avance', due_topics: 'Temas vencidos', compliance_pct: '% Cumplimiento', topic_id: 'ID Tema',
  title: 'Tema', scheduled_on: 'Programado', actual_date: 'Fecha real', days_late: 'Días de atraso',
  days_ahead: 'Días de adelanto', reason_label: 'Motivo', observations: 'Observaciones',
  enrolled_students: 'Alumnos inscritos', total: 'Total',
  period_label: 'Periodo', period_start: 'Desde', period_end: 'Hasta', attendance_records: 'Registros de asistencia',
  leave_requests_created: 'Permisos solicitados',
}

function reportPath(key) {
  if (key === 'absences-unjustified') return '/api/reports/absences/unjustified'
  if (key === 'absences-justified') return '/api/reports/absences/justified'
  return `/api/reports/${key}`
}

function formatReportCell(value) {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

export function ReportsPanel({ session }) {
  const { token } = session
  const [reportKey, setReportKey] = useState(REPORT_OPTIONS[0].key)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState({ start: '', end: '' })

  const isPeriodComparison = reportKey === 'period-comparison'

  useEffect(() => {
    if (isPeriodComparison) {
      setRows([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    apiRequest(reportPath(reportKey), { token })
      .then((res) => { if (!cancelled) setRows(res.data || []) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reportKey, token, isPeriodComparison])

  async function runPeriodComparison(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await apiRequest(`/api/reports/period-comparison?start=${period.start}&end=${period.end}`, { token })
      setRows(res.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : []

  return (
    <div className="admin-wrap">
      {isPeriodComparison && (
        <section className="panel admin-form-panel">
          <h3>Comparativo por periodo</h3>
          <p className="muted">Compara el rango elegido contra el periodo inmediatamente anterior de igual duración.</p>
          <form className="admin-form" onSubmit={runPeriodComparison}>
            <label>Desde<input type="date" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} required /></label>
            <label>Hasta<input type="date" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} required /></label>
            <button className="primary">Comparar</button>
          </form>
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Reportes</h3>
            <p className="muted">Calculados por completo en el procedimiento almacenado; esta pantalla solo los muestra.</p>
          </div>
          <select value={reportKey} onChange={(e) => setReportKey(e.target.value)}>
            {REPORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <ErrorNote message={error} />
        {loading ? <p className="muted">Cargando…</p> : rows.length === 0 ? <p className="muted">Sin datos para este reporte todavía.</p> : (
          <div className="report-table-scroll">
            <table className="admin-table">
              <thead><tr>{columns.map((c) => <th key={c}>{REPORT_COLUMN_LABELS[c] || c}</th>)}</tr></thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>{columns.map((c) => <td key={c}>{formatReportCell(row[c])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export function ChangePasswordPanel({ session }) {
  const { token } = session
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (form.newPassword !== form.confirmPassword) {
      setError('La confirmación no coincide con la nueva contraseña.')
      return
    }
    setSubmitting(true)
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST', token, body: { currentPassword: form.currentPassword, newPassword: form.newPassword },
      })
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setSuccess('Contraseña actualizada.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-wrap">
      <section className="panel admin-form-panel">
        <h3>Cambiar mi contraseña</h3>
        <p className="muted">Necesitas tu contraseña actual. No hay recuperación por correo: si la perdiste, pide a un administrador que te la resetee.</p>
        <form className="admin-form" onSubmit={handleSubmit}>
          <label>Contraseña actual<input type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required /></label>
          <label>Nueva contraseña<input type="password" minLength={8} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required /></label>
          <label>Confirmar nueva contraseña<input type="password" minLength={8} value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required /></label>
          <ErrorNote message={error} />
          {success && <p className="temp-password-box">{success}</p>}
          <button className="primary" disabled={submitting}>{submitting ? 'Guardando…' : 'Cambiar contraseña'}</button>
        </form>
      </section>
    </div>
  )
}

export function RealDashboard({ session }) {
  const { token, profile } = session
  const isStudent = profile.roleCode === 'student'
  const { items: agenda, error: agendaError, loading: agendaLoading } = useList('/api/me/agenda', token)
  const [metrics, setMetrics] = useState(null)
  const [metricsError, setMetricsError] = useState('')

  useEffect(() => {
    let cancelled = false
    apiRequest('/api/me/metrics', { token })
      .then((res) => { if (!cancelled) setMetrics(res.data) })
      .catch((err) => { if (!cancelled) setMetricsError(err.message) })
    return () => { cancelled = true }
  }, [token])

  return (
    <div className="admin-wrap">
      <section className="panel">
        <h3>Hola, {profile.fullName}</h3>
        <ErrorNote message={metricsError} />
        <div className="metrics">
          {isStudent ? (
            <>
              <article className="metric"><div className="metric-head"><span>Asistencia</span></div><strong>{metrics?.attendance_rate ?? '—'}%</strong></article>
              <article className="metric"><div className="metric-head"><span>Temas pendientes</span></div><strong>{metrics?.topics_pending ?? '—'}</strong></article>
              <article className="metric"><div className="metric-head"><span>Avance del programa</span></div><strong>{metrics?.program_progress_pct ?? '—'}%</strong></article>
            </>
          ) : (
            <>
              <article className="metric"><div className="metric-head"><span>Clases esta semana</span></div><strong>{metrics?.classes_this_week ?? '—'}</strong></article>
              <article className="metric"><div className="metric-head"><span>Asistencia del grupo</span></div><strong>{metrics?.group_attendance_rate ?? '—'}%</strong></article>
              <article className="metric"><div className="metric-head"><span>Temas atrasados</span></div><strong>{metrics?.delayed_topics ?? '—'}</strong></article>
            </>
          )}
        </div>
      </section>
      <section className="panel">
        <h3>{isStudent ? 'Próximas sesiones' : 'Tu agenda'}</h3>
        <ErrorNote message={agendaError} />
        {agendaLoading ? <p className="muted">Cargando…</p> : agenda.length === 0 ? <p className="muted">No hay temas programados próximamente.</p> : (
          <table className="admin-table">
            <thead><tr><th>Tema</th><th>Fecha</th><th>Componente</th><th>{isStudent ? 'Instructor' : 'Alumnos inscritos'}</th></tr></thead>
            <tbody>
              {agenda.map((t) => (
                <tr key={t.topic_id}>
                  <td>{t.title}</td>
                  <td>{t.scheduled_on}</td>
                  <td>{t.component_name} · {t.program_name}</td>
                  <td>{isStudent ? (t.instructor_name || '—') : `${t.enrolled_students} alumno(s)`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
