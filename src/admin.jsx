import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Calendar, Users as UsersIcon } from 'lucide-react'
import { apiDownload, apiRequest, apiUpload } from './api'
import { buildMaterialPrompt, DEFAULT_PROMPT_OPTIONS, MATERIAL_LEVELS, SKILL_NAME, suggestedBatchSize } from './materialPrompt'

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

// Traduce los codigos que vienen de SIGNAL en los SPs (snake_case tecnico)
// a un mensaje legible. Si no esta mapeado, se muestra tal cual (mejor un
// codigo en ingles que nada).
const ERROR_MESSAGES = {
  not_authorized: 'No tienes permiso para esta acción.',
  role_not_allowed_for_actor: 'Ese rol no está permitido para quien lo crea.',
  tenant_required: 'Debes seleccionar un tenant.',
  tenant_mismatch: 'Ese registro pertenece a otro tenant.',
  tenant_not_found: 'Tenant no encontrado.',
  tenant_inactive: 'El tenant está inactivo.',
  invalid_status: 'Estado inválido.',
  instructor_invalid: 'El instructor seleccionado no es válido.',
  instructor_not_available: 'El instructor no está disponible en ese horario.',
  instructor_schedule_conflict: 'Ese instructor ya tiene otro grupo en ese horario, aunque sea de otro componente.',
  student_invalid: 'El alumno seleccionado no es válido.',
  student_not_enrolled_in_program: 'El alumno no está inscrito en el programa.',
  invalid_date_range: 'El rango de fechas no es válido.',
  invalid_schedule_day: 'El horario ingresado no es válido.',
  invalid_color_format: 'El color debe tener formato #RRGGBB.',
  schedule_not_configured: 'Este grupo todavía no tiene un horario semanal. Ve a "Ver horario" (o al horario semanal del programa) y arrastra al menos un bloque antes de generar fechas.',
  schedule_generation_failed: 'No se pudieron generar las fechas con el horario configurado.',
  date_is_holiday: 'Esa fecha es un feriado.',
  email_already_exists: 'Ese correo ya está registrado.',
  slug_already_exists: 'Ese slug ya está en uso.',
  holiday_already_exists: 'Ese feriado ya existe.',
  already_enrolled: 'Ya está inscrito.',
  leave_not_pending: 'Ese permiso ya no está pendiente.',
  target_not_found: 'No se encontró el registro.',
  program_not_found: 'Programa no encontrado.',
  component_not_found: 'Componente no encontrado.',
  group_not_found: 'Grupo no encontrado.',
  tenant_branding_unavailable: 'No se pudo cargar la marca del tenant.',
  invalid_file_type: 'Tipo de archivo no permitido.',
  upload_failed: 'No se pudo subir el archivo.',
  invalid_zip: 'El archivo no es un ZIP válido.',
  material_missing_topics: 'El ZIP no tiene ningún tema-01.html, tema-02.html… en la raíz. Revisa la plantilla.',
  material_invalid_path: 'El ZIP contiene rutas no permitidas (por ejemplo "../").',
  material_too_large: 'El ZIP es demasiado grande (máximo 50 MB comprimido y 300 MB descomprimido).',
  material_not_found: 'Este componente no tiene material subido.',
  title_required: 'El tema no puede quedar vacío.',
  temario_sheet_not_found: 'El Excel no tiene la hoja del temario exportado (columnas "ID componente", "N°" y "Tema"). Usa el archivo de "Exportar temario".',
}

function ErrorNote({ message }) {
  if (!message) return null
  return <p className="form-error">{ERROR_MESSAGES[message] || message}</p>
}

function StatusPill({ label }) {
  if (!label) return null
  return <span className="pill">{label}</span>
}

// El servidor guarda el archivo en un volumen persistente (UPLOADS_DIR), no
// en el disco efimero del contenedor: sobrevive a los redeploys de Railway.
function LogoUploader({ session, tenantId, currentLogoUrl, onUploaded }) {
  const { token } = session
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('logo', file)
      const res = await apiUpload(`/api/tenants/${tenantId}/logo`, { token, formData })
      onUploaded?.(res.logoUrl)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="logo-uploader">
      {currentLogoUrl && <img src={currentLogoUrl} alt="Logo" className="logo-preview" />}
      <label className="btn-mini logo-upload-label">
        {uploading ? 'Subiendo…' : currentLogoUrl ? 'Cambiar logo' : 'Subir logo'}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleFile} hidden />
      </label>
      {error && <ErrorNote message={error} />}
    </div>
  )
}

// Plantilla publica (sin token: es un link normal, sin datos sensibles) +
// carga que reusa el mismo SP fila a fila que el formulario manual. Los
// errores de negocio se listan por fila; el resto del archivo igual se procesa.
function ExcelImportBox({ session, templateUrl, importUrl, onImported }) {
  const { token } = session
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setResult(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiUpload(importUrl, { token, formData })
      setResult(res)
      onImported?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const failedRows = result?.results.filter((r) => !r.ok) || []
  const withPassword = result?.results.filter((r) => r.ok && r.temporaryPassword) || []

  return (
    <div className="excel-import">
      <div className="excel-import-actions">
        <a className="btn-mini" href={templateUrl} download>Descargar plantilla</a>
        <label className="btn-mini logo-upload-label">
          {uploading ? 'Cargando…' : 'Cargar Excel'}
          <input type="file" accept=".xlsx" onChange={handleFile} hidden />
        </label>
      </div>
      <ErrorNote message={error} />
      {result && (
        <div className="excel-import-result">
          <p className={failedRows.length ? 'form-error' : 'temp-password-box'}>
            {result.created} creado(s), {result.failed} con error.
          </p>
          {failedRows.length > 0 && (
            <ul className="excel-import-errors">
              {failedRows.map((r) => <li key={r.row}>Fila {r.row}: {r.message}</li>)}
            </ul>
          )}
          {withPassword.length > 0 && (
            <div className="temp-password-box">
              Contraseñas temporales (compártelas fuera del sistema; se pedirá cambiarla al ingresar):
              <ul className="excel-import-errors">
                {withPassword.map((r) => <li key={r.row}><strong>{r.email}</strong>: <code>{r.temporaryPassword}</code></li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Exportar el temario real del programa y volver a cargarlo corregido
// (actualiza por componente + N° de tema; ver /api/programs/:id/temario).
function TemarioExcelBox({ session, program }) {
  const { token } = session
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function handleExport() {
    setError('')
    setBusy('export')
    try {
      await apiDownload(`/api/programs/${program.id}/temario/export`, { token, filename: `temario-${program.name}.xlsx` })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setResult(null)
    setBusy('import')
    try {
      const formData = new FormData()
      formData.append('file', file)
      setResult(await apiUpload(`/api/programs/${program.id}/temario/import`, { token, formData }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
      e.target.value = ''
    }
  }

  const failedRows = result?.results.filter((r) => !r.ok) || []

  return (
    <div className="excel-import">
      <div className="excel-import-actions">
        <button type="button" className="btn-mini" onClick={handleExport} disabled={busy !== ''}>{busy === 'export' ? 'Exportando…' : 'Exportar temario (Excel)'}</button>
        <label className="btn-mini logo-upload-label">
          {busy === 'import' ? 'Cargando…' : 'Cargar temario corregido'}
          <input type="file" accept=".xlsx" onChange={handleFile} disabled={busy !== ''} hidden />
        </label>
      </div>
      <ErrorNote message={error} />
      {result && (
        <div className="excel-import-result">
          <p className={failedRows.length ? 'form-error' : 'temp-password-box'}>
            {result.updated} tema(s) corregido(s), {result.unchanged} sin cambios, {result.failed} con error.
          </p>
          {failedRows.length > 0 && (
            <ul className="excel-import-errors">
              {failedRows.map((r) => <li key={r.row}>Fila {r.row}: {ERROR_MESSAGES[r.message] || r.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// Carga completa: un solo Excel (Componentes + hoja de horario con fecha/
// hora reales) crea o actualiza componentes, su grupo por defecto, todo
// el temario con fecha real, y el horario semanal recurrente de cada
// grupo. Resumen mas rico que ExcelImportBox: tres bloques (componentes,
// temas, horario) en vez de uno.
function FullProgramImportBox({ session, program, onImported }) {
  const { token } = session
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setResult(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiUpload(`/api/programs/${program.id}/full-import`, { token, formData })
      setResult(res)
      onImported?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function Block({ title, summary }) {
    if (!summary) return null
    const failedRows = summary.results.filter((r) => !r.ok)
    return (
      <div className="excel-import-block">
        <strong>{title}:</strong> {summary.created} creado(s), {summary.failed} con error.
        {failedRows.length > 0 && (
          <ul className="excel-import-errors">
            {failedRows.map((r, i) => <li key={i}>{r.row ? `Fila ${r.row}: ` : ''}{r.message}</li>)}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="excel-import">
      <div className="excel-import-actions">
        <a className="btn-mini" href="/api/templates/program-full" download>Descargar plantilla</a>
        <label className="btn-mini logo-upload-label">
          {uploading ? 'Cargando…' : 'Cargar Excel completo'}
          <input type="file" accept=".xlsx" onChange={handleFile} hidden />
        </label>
      </div>
      <ErrorNote message={error} />
      {result && (
        <div className="excel-import-result">
          <Block title="Feriados" summary={result.holidays} />
          <Block title="Componentes" summary={result.components} />
          <Block title="Temario" summary={result.topics} />
          <Block title="Horario semanal" summary={result.scheduleDays} />
        </div>
      )}
    </div>
  )
}

function BrandColorPicker({ session, tenantId, currentColor, onSaved }) {
  const { token } = session
  const [color, setColor] = useState(currentColor || '#f4a500')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setColor(currentColor || '#f4a500') }, [currentColor])

  async function handleChange(e) {
    const next = e.target.value
    setColor(next)
    setSaving(true)
    setError('')
    try {
      await apiRequest(`/api/tenants/${tenantId}/brand-color`, { method: 'POST', token, body: { brandColor: next } })
      onSaved?.(next)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="color-picker">
      <input type="color" value={color} onChange={handleChange} title="Color de marca" />
      {saving && <small className="muted">Guardando…</small>}
      {error && <ErrorNote message={error} />}
    </div>
  )
}

// El link es publico (sin sesion) porque justamente sirve para llegar al
// login de ESE tenant: el backend igual valida ahi que la cuenta pertenezca
// a este tenant antes de autenticar a nadie.
function TenantLoginLink({ slug }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/t/${slug}`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API puede fallar por permisos/contexto; no bloquea el flujo.
    }
  }

  return (
    <div className="tenant-link">
      <code>{url}</code>
      <button type="button" className="btn-mini" onClick={handleCopy}>{copied ? 'Copiado' : 'Copiar'}</button>
    </div>
  )
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
            <thead><tr><th>Nombre</th><th>Slug</th><th>Estado</th><th>Contacto</th><th>Logo</th><th>Color</th><th>Link de acceso</th><th></th></tr></thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.slug}</td>
                  <td><StatusPill label={t.status_label} /></td>
                  <td>{t.contact_email || '—'}</td>
                  <td><LogoUploader session={session} tenantId={t.id} currentLogoUrl={t.logo_path ? `/uploads/${t.logo_path}` : null} onUploaded={reload} /></td>
                  <td><BrandColorPicker session={session} tenantId={t.id} currentColor={t.brand_color} onSaved={reload} /></td>
                  <td><TenantLoginLink slug={t.slug} /></td>
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

  const roleOptions = isSuperAdmin ? ['tenant_admin', 'instructor', 'student', 'super_admin'] : ['instructor', 'student']

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
          {isSuperAdmin && form.roleCode !== 'super_admin' && (
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
      <section className="panel admin-form-panel">
        <h3>Carga masiva</h3>
        <p className="muted">Estudiantes e instructores en un solo Excel. El rol se indica por fila (instructor/estudiante).</p>
        <ExcelImportBox session={session} templateUrl="/api/templates/users" importUrl="/api/users/import" onImported={reload} />
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

// Cada tema de un componente dura 45 min de forma fija (regla de negocio del
// cliente): no se pide duracion en el formulario ni en la carga por Excel.
const TOPIC_DURATION_MINUTES = 45

function TopicsPanel({ session, group, onBack }) {
  const { token } = session
  const { items, error, loading, reload } = useList(`/api/groups/${group.id}/topics`, token)
  const [form, setForm] = useState({ title: '', description: '', scheduledOn: '' })
  const [formError, setFormError] = useState('')
  const topicStatuses = useCatalog('TOPIC_STATUS', token)

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    try {
      await apiRequest(`/api/groups/${group.id}/topics`, {
        method: 'POST', token,
        body: { ...form, durationMinutes: TOPIC_DURATION_MINUTES },
      })
      setForm({ title: '', description: '', scheduledOn: '' })
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
      <button className="text-button crumb-back" onClick={onBack}>← Volver a {group.name}</button>
      <section className="panel admin-form-panel">
        <h3>Nuevo tema — {group.name}</h3>
        <form className="admin-form" onSubmit={handleCreate}>
          <label>Título<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
          <label className="full-field">Descripción<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Fecha programada (opcional)<input type="date" value={form.scheduledOn} onChange={(e) => setForm({ ...form, scheduledOn: e.target.value })} /></label>
          <ErrorNote message={formError} />
          <button className="primary">Crear tema</button>
        </form>
      </section>
      <section className="panel admin-form-panel">
        <h3>Carga masiva</h3>
        <p className="muted">Todo el temario de {group.name} en un solo Excel. Cada tema dura 45 min; la fecha es opcional.</p>
        <ExcelImportBox session={session} templateUrl="/api/templates/topics" importUrl={`/api/groups/${group.id}/topics/import`} onImported={reload} />
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

// Combo con busqueda al escribir: reemplaza <select> para listas largas de
// instructores/alumnos, donde desplazarse por un desplegable es mala UX.
function SearchSelect({ options, value, onChange, placeholder, allowEmpty = true, emptyLabel = 'Sin asignar' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selected = options.find((o) => String(o.id) === String(value))
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = normalizedQuery
    ? options.filter((o) => o.full_name.toLowerCase().includes(normalizedQuery) || (o.email || '').toLowerCase().includes(normalizedQuery))
    : options

  function pick(id) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="search-select" ref={containerRef}>
      <input
        type="text"
        placeholder={placeholder || 'Buscar…'}
        value={open ? query : (selected ? selected.full_name : '')}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
      />
      {open && (
        <div className="search-select-menu">
          {allowEmpty && <div className="search-select-option muted" onClick={() => pick('')}>— {emptyLabel} —</div>}
          {filtered.map((o) => (
            <div key={o.id} className="search-select-option" onClick={() => pick(String(o.id))}>
              {o.full_name}{o.email ? <small> · {o.email}</small> : null}
            </div>
          ))}
          {filtered.length === 0 && <div className="search-select-empty">Sin resultados</div>}
        </div>
      )}
    </div>
  )
}

const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const SCHEDULE_SLOT_MINUTES = 30
const SCHEDULE_START_HOUR = 7
const SCHEDULE_END_HOUR = 21
// Minuto-del-dia de inicio de cada franja de 30 min entre 07:00 y 21:00.
const SCHEDULE_SLOTS = Array.from(
  { length: ((SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * 60) / SCHEDULE_SLOT_MINUTES },
  (_, i) => SCHEDULE_START_HOUR * 60 + i * SCHEDULE_SLOT_MINUTES,
)

function pad2(n) { return String(n).padStart(2, '0') }
function minutesToTime(mins) { return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}` }
function timeToMinutes(t) { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + (m || 0) }

// Grilla semanal en franjas de 30 min: clic y arrastre vertical dentro de un
// dia va "pintando" el bloque (no solo horas completas). Al soltar el mouse
// se manda el rango completo; el servidor decide si el instructor choca con
// otro grupo suyo (ON DUPLICATE KEY reemplaza el bloque previo de ese dia).
function GroupSchedulePanel({ session, group }) {
  const { token } = session
  const { items, error, loading, reload } = useList(`/api/groups/${group.id}/schedule-days`, token)
  const [dropError, setDropError] = useState('')
  const [drag, setDrag] = useState(null) // { weekday, startIdx, endIdx }
  const dragRef = useRef(null)
  dragRef.current = drag

  function cellFor(weekday, slotStart) {
    return items.find((d) => d.weekday === weekday && timeToMinutes(d.start_time) <= slotStart && slotStart < timeToMinutes(d.end_time))
  }

  async function assign(weekday, startTime, endTime) {
    setDropError('')
    try {
      await apiRequest(`/api/groups/${group.id}/schedule-days`, { method: 'POST', token, body: { weekday, startTime, endTime } })
      reload()
    } catch (err) {
      setDropError(err.message)
    }
  }

  async function remove(weekday) {
    setDropError('')
    try {
      await apiRequest(`/api/groups/${group.id}/schedule-days/${weekday}`, { method: 'DELETE', token })
      reload()
    } catch (err) {
      setDropError(err.message)
    }
  }

  useEffect(() => {
    function commit() {
      const current = dragRef.current
      setDrag(null)
      if (!current) return
      const lo = Math.min(current.startIdx, current.endIdx)
      const hi = Math.max(current.startIdx, current.endIdx)
      assign(current.weekday, minutesToTime(SCHEDULE_SLOTS[lo]), minutesToTime(SCHEDULE_SLOTS[hi] + SCHEDULE_SLOT_MINUTES))
    }
    window.addEventListener('mouseup', commit)
    return () => window.removeEventListener('mouseup', commit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id])

  function startDrag(weekday, idx) {
    if (cellFor(weekday, SCHEDULE_SLOTS[idx])) return // ocupado: se quita con "x" antes de repintar
    setDrag({ weekday, startIdx: idx, endIdx: idx })
  }

  function extendDrag(weekday, idx) {
    setDrag((current) => (current && current.weekday === weekday ? { ...current, endIdx: idx } : current))
  }

  function isSelecting(weekday, idx) {
    if (!drag || drag.weekday !== weekday) return false
    const lo = Math.min(drag.startIdx, drag.endIdx)
    const hi = Math.max(drag.startIdx, drag.endIdx)
    return idx >= lo && idx <= hi
  }

  return (
    <section className="panel">
      <h3>Horario — {group.name}</h3>
      <p className="muted">Haz clic y arrastra verticalmente sobre un día para pintar el bloque (franjas de 30 min). Un instructor no puede quedar en dos grupos con horario cruzado, sin importar el componente.</p>
      <ErrorNote message={error || dropError} />
      {loading ? <p className="muted">Cargando…</p> : (
        <div className="schedule-grid-scroll">
          <table className="schedule-grid" onMouseLeave={() => setDrag(null)}>
            <thead>
              <tr><th></th>{WEEKDAY_ORDER.map((w) => <th key={w}>{WEEKDAY_LABELS[w]}</th>)}</tr>
            </thead>
            <tbody>
              {SCHEDULE_SLOTS.map((slotStart, idx) => (
                <tr key={slotStart}>
                  <td className="schedule-hour">{slotStart % 60 === 0 ? minutesToTime(slotStart) : ''}</td>
                  {WEEKDAY_ORDER.map((w) => {
                    const cell = cellFor(w, slotStart)
                    const isStart = cell && timeToMinutes(cell.start_time) === slotStart
                    const classes = ['schedule-cell']
                    if (cell) classes.push('filled')
                    if (isSelecting(w, idx)) classes.push('selecting')
                    return (
                      <td
                        key={w}
                        className={classes.join(' ')}
                        onMouseDown={() => startDrag(w, idx)}
                        onMouseEnter={() => extendDrag(w, idx)}
                      >
                        {isStart && (
                          <div className="schedule-block">
                            {cell.start_time.slice(0, 5)}–{cell.end_time.slice(0, 5)}
                            <button className="pill-remove" onMouseDown={(e) => e.stopPropagation()} onClick={() => remove(w)}>×</button>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const GROUP_COLORS = ['#087fb8', '#f4a500', '#2e8b57', '#8e44ad', '#d35400', '#16a085', '#c0392b', '#2c3e50', '#7f8c8d', '#27ae60']

// Horario semanal de TODO el programa: todos los grupos de todos sus
// componentes en un solo grid, para ir "jalando" y armando la malla
// completa en un solo lugar en vez de entrar grupo por grupo. Se elige un
// grupo de la paleta (queda "armado") y se pinta con clic+arrastre; el
// servidor sigue siendo quien decide si el instructor choca con otro grupo.
// Grilla de configuracion del horario RECURRENTE (dia de semana + hora, sin
// año/mes): sirve para armar el patron semanal de un grupo antes de tener
// fechas reales. El calendario real (por semana, con fechas) es
// ProgramWeeklyCalendar, mas abajo.
function RecurringScheduleGrid({ session, program }) {
  const { token } = session
  const { items: groups, error: groupsError, loading: groupsLoading } = useList(`/api/programs/${program.id}/groups`, token)
  const { items: scheduleDays, error: scheduleError, loading: scheduleLoading, reload: reloadSchedule } = useList(`/api/programs/${program.id}/schedule-days`, token)
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [drag, setDrag] = useState(null)
  const [dropError, setDropError] = useState('')
  const dragRef = useRef(null)
  dragRef.current = drag

  useEffect(() => {
    if (selectedGroupId === null && groups.length > 0) setSelectedGroupId(groups[0].group_id)
  }, [groups, selectedGroupId])

  const colorByGroupId = useMemo(() => {
    const map = new Map()
    groups.forEach((g, i) => map.set(g.group_id, GROUP_COLORS[i % GROUP_COLORS.length]))
    return map
  }, [groups])

  function cellFor(weekday, slotStart) {
    return scheduleDays.find((d) => d.weekday === weekday && timeToMinutes(d.start_time) <= slotStart && slotStart < timeToMinutes(d.end_time))
  }

  async function assign(groupId, weekday, startTime, endTime) {
    setDropError('')
    try {
      await apiRequest(`/api/groups/${groupId}/schedule-days`, { method: 'POST', token, body: { weekday, startTime, endTime } })
      reloadSchedule()
    } catch (err) {
      setDropError(err.message)
    }
  }

  async function remove(groupId, weekday) {
    setDropError('')
    try {
      await apiRequest(`/api/groups/${groupId}/schedule-days/${weekday}`, { method: 'DELETE', token })
      reloadSchedule()
    } catch (err) {
      setDropError(err.message)
    }
  }

  useEffect(() => {
    function commit() {
      const current = dragRef.current
      setDrag(null)
      if (!current) return
      const lo = Math.min(current.startIdx, current.endIdx)
      const hi = Math.max(current.startIdx, current.endIdx)
      assign(current.groupId, current.weekday, minutesToTime(SCHEDULE_SLOTS[lo]), minutesToTime(SCHEDULE_SLOTS[hi] + SCHEDULE_SLOT_MINUTES))
    }
    window.addEventListener('mouseup', commit)
    return () => window.removeEventListener('mouseup', commit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.id])

  function startDrag(weekday, idx) {
    if (!selectedGroupId || cellFor(weekday, SCHEDULE_SLOTS[idx])) return
    setDrag({ groupId: selectedGroupId, weekday, startIdx: idx, endIdx: idx })
  }

  function extendDrag(weekday, idx) {
    setDrag((current) => (current && current.weekday === weekday ? { ...current, endIdx: idx } : current))
  }

  function isSelecting(weekday, idx) {
    if (!drag || drag.weekday !== weekday) return false
    const lo = Math.min(drag.startIdx, drag.endIdx)
    const hi = Math.max(drag.startIdx, drag.endIdx)
    return idx >= lo && idx <= hi
  }

  return (
    <section className="panel">
        <h3>Horario recurrente (configuración)</h3>
        <p className="muted">Elige un grupo abajo y luego haz clic y arrastra sobre la grilla para pintar su horario semanal (franjas de 30 min). Este patrón sirve para generar fechas de nuevos grupos; el calendario real por semana está en la otra pestaña. Un instructor no puede quedar en dos grupos con horario cruzado.</p>
        <ErrorNote message={groupsError || scheduleError || dropError} />
        {groupsLoading ? <p className="muted">Cargando…</p> : groups.length === 0 ? <p className="muted">Este programa todavía no tiene componentes con grupos.</p> : (
          <>
            <div className="group-palette">
              {groups.map((g) => (
                <button
                  key={g.group_id}
                  type="button"
                  className={g.group_id === selectedGroupId ? 'group-chip active' : 'group-chip'}
                  style={{ '--chip-color': colorByGroupId.get(g.group_id) }}
                  onClick={() => setSelectedGroupId(g.group_id)}
                >
                  {g.component_name} · {g.group_name}
                  <small>{g.instructor_name || 'sin instructor'}</small>
                </button>
              ))}
            </div>
            {scheduleLoading ? <p className="muted">Cargando horario…</p> : (
              <div className="schedule-grid-scroll">
                <table className="schedule-grid" onMouseLeave={() => setDrag(null)}>
                  <thead><tr><th></th>{WEEKDAY_ORDER.map((w) => <th key={w}>{WEEKDAY_LABELS[w]}</th>)}</tr></thead>
                  <tbody>
                    {SCHEDULE_SLOTS.map((slotStart, idx) => (
                      <tr key={slotStart}>
                        <td className="schedule-hour">{slotStart % 60 === 0 ? minutesToTime(slotStart) : ''}</td>
                        {WEEKDAY_ORDER.map((w) => {
                          const cell = cellFor(w, slotStart)
                          const isStart = cell && timeToMinutes(cell.start_time) === slotStart
                          const group = cell && groups.find((g) => g.group_id === cell.group_id)
                          const color = cell && colorByGroupId.get(cell.group_id)
                          const classes = ['schedule-cell']
                          if (cell) classes.push('filled')
                          if (isSelecting(w, idx)) classes.push('selecting')
                          return (
                            <td
                              key={w}
                              className={classes.join(' ')}
                              style={cell ? { background: `${color}22`, borderColor: color } : undefined}
                              onMouseDown={() => startDrag(w, idx)}
                              onMouseEnter={() => extendDrag(w, idx)}
                            >
                              {isStart && (
                                <div className="schedule-block" style={{ background: color }}>
                                  <span>{group ? `${group.component_name} · ${group.group_name}` : ''} {cell.start_time.slice(0, 5)}–{cell.end_time.slice(0, 5)}</span>
                                  <button className="pill-remove" onMouseDown={(e) => e.stopPropagation()} onClick={() => remove(cell.group_id, w)}>×</button>
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
    </section>
  )
}

// Calendario real, semana por semana: muestra las clases con sus fechas
// verdaderas (viene de sp_topics_list_by_program), no el patron recurrente.
// Es la vista principal al abrir "Horario semanal del programa".
function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d
}
function addDays(date, n) {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}
function toISODate(date) { return date.toISOString().slice(0, 10) }
function formatDayLabel(date) {
  return date.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function ProgramWeeklyCalendar({ session, program }) {
  const { token } = session
  const { items: topics, loading, error } = useList(`/api/programs/${program.id}/topics`, token)
  const { items: holidays } = useList(program.tenant_id ? `/api/holidays?tenantId=${program.tenant_id}` : '/api/holidays', token)
  const [weekStart, setWeekStart] = useState(null)

  const earliestDate = useMemo(() => {
    const dates = topics.filter((t) => t.scheduled_on).map((t) => t.scheduled_on).sort()
    return dates[0] || null
  }, [topics])

  useEffect(() => {
    if (weekStart === null && earliestDate) setWeekStart(startOfWeek(earliestDate))
  }, [earliestDate, weekStart])

  if (loading) return <p className="muted">Cargando…</p>
  if (!earliestDate) return <p className="muted">Este programa todavía no tiene temario con fechas. Usa la carga completa por Excel o "Generar fechas" en un grupo.</p>
  if (!weekStart) return null

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const holidaySet = new Set(holidays.map((h) => h.holiday_on))
  const topicsByDate = new Map()
  topics.forEach((t) => {
    if (!t.scheduled_on) return
    if (!topicsByDate.has(t.scheduled_on)) topicsByDate.set(t.scheduled_on, [])
    topicsByDate.get(t.scheduled_on).push(t)
  })

  return (
    <div>
      <div className="week-nav">
        <button className="btn-mini" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Semana anterior</button>
        <strong>{formatDayLabel(days[0])} – {formatDayLabel(days[6])}</strong>
        <button className="btn-mini" onClick={() => setWeekStart(addDays(weekStart, 7))}>Semana siguiente →</button>
      </div>
      <ErrorNote message={error} />
      <div className="week-grid">
        {days.map((d) => {
          const iso = toISODate(d)
          const dayTopics = (topicsByDate.get(iso) || []).slice().sort((a, b) => a.component_name.localeCompare(b.component_name))
          const isHoliday = holidaySet.has(iso)
          return (
            <div key={iso} className={isHoliday ? 'week-day holiday' : 'week-day'}>
              <div className="week-day-head">{formatDayLabel(d)}</div>
              {isHoliday && <div className="week-day-holiday-tag">Feriado</div>}
              {dayTopics.length === 0 && !isHoliday && <p className="muted week-day-empty">Sin clases</p>}
              {dayTopics.map((t) => (
                <div key={t.id} className="week-topic">
                  <strong>{t.component_name}</strong>
                  <span>{t.title}</span>
                  <small>{t.group_name}{t.instructor_name ? ` · ${t.instructor_name}` : ''}</small>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProgramSchedulePanel({ session, program, onBack }) {
  const [tab, setTab] = useState('calendar')
  return (
    <div className="admin-wrap">
      <button className="text-button crumb-back" onClick={onBack}>← Volver a componentes</button>
      <section className="panel">
        <h3>Horario — {program.name}</h3>
        <div className="tab-row">
          <button className={tab === 'calendar' ? 'tab-button active' : 'tab-button'} onClick={() => setTab('calendar')}>Calendario semanal</button>
          <button className={tab === 'recurring' ? 'tab-button active' : 'tab-button'} onClick={() => setTab('recurring')}>Horario recurrente</button>
        </div>
      </section>
      {tab === 'calendar'
        ? <section className="panel"><ProgramWeeklyCalendar session={session} program={program} /></section>
        : <RecurringScheduleGrid session={session} program={program} />}
    </div>
  )
}

// Semanas reales de UN grupo, con sus sesiones y temas (usa las fechas
// reales del temario, no el patron recurrente). La hora se deriva del
// horario recurrente del grupo para ese dia de semana, cuando existe.
function GroupWeeksView({ session, group }) {
  const { token } = session
  const { items: topics, loading, error } = useList(`/api/groups/${group.id}/topics`, token)
  const { items: scheduleDays } = useList(`/api/groups/${group.id}/schedule-days`, token)

  const weeks = useMemo(() => {
    const dated = topics.filter((t) => t.scheduled_on).slice().sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on))
    const map = new Map()
    dated.forEach((t) => {
      const weekKey = toISODate(startOfWeek(t.scheduled_on))
      if (!map.has(weekKey)) map.set(weekKey, [])
      map.get(weekKey).push(t)
    })
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [topics])

  function timeFor(topic) {
    const weekday = new Date(`${topic.scheduled_on}T00:00:00Z`).getUTCDay()
    const day = scheduleDays.find((d) => d.weekday === weekday)
    return day ? `${day.start_time.slice(0, 5)}–${day.end_time.slice(0, 5)}` : null
  }

  if (loading) return <p className="muted">Cargando…</p>

  const undated = topics.filter((t) => !t.scheduled_on)

  return (
    <div>
      <ErrorNote message={error} />
      {weeks.length === 0 && undated.length === 0 && (
        <p className="muted">Este grupo todavía no tiene temario. Cárgalo con el Excel completo del programa o crea temas manualmente.</p>
      )}
      {weeks.map(([weekKey, weekTopics], i) => {
        const weekStartDate = new Date(`${weekKey}T00:00:00Z`)
        const weekEndDate = addDays(weekStartDate, 6)
        return (
          <div className="week-block" key={weekKey}>
            <h4>Semana {i + 1} · {formatDayLabel(weekStartDate)} – {formatDayLabel(weekEndDate)}</h4>
            <ul className="session-list">
              {weekTopics.map((t) => (
                <li key={t.id}>
                  <span className="session-date">{formatDayLabel(new Date(`${t.scheduled_on}T00:00:00Z`))}</span>
                  {timeFor(t) && <span className="session-time">{timeFor(t)}</span>}
                  <span className="session-title">{t.title}</span>
                  <StatusPill label={t.status_label} />
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {undated.length > 0 && (
        <div className="week-block">
          <h4>Sin fecha programada</h4>
          <ul className="session-list">
            {undated.map((t) => (
              <li key={t.id}><span className="session-title">{t.title}</span><StatusPill label={t.status_label} /></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function GroupHorarioPanel({ session, group, onBack }) {
  const [tab, setTab] = useState('weeks')
  return (
    <div className="admin-wrap">
      <button className="text-button crumb-back" onClick={onBack}>← Volver</button>
      <section className="panel">
        <h3>Horario — {group.name}</h3>
        <div className="tab-row">
          <button className={tab === 'weeks' ? 'tab-button active' : 'tab-button'} onClick={() => setTab('weeks')}>Semanas</button>
          <button className={tab === 'recurring' ? 'tab-button active' : 'tab-button'} onClick={() => setTab('recurring')}>Horario recurrente</button>
        </div>
      </section>
      {tab === 'weeks'
        ? <section className="panel"><GroupWeeksView session={session} group={group} /></section>
        : <GroupSchedulePanel session={session} group={group} />}
    </div>
  )
}

// Un alumno debe estar inscrito en el PROGRAMA antes de poder inscribirse
// en un grupo (regla del SP: student_not_enrolled_in_program). Este modal
// hace los dos pasos de forma transparente: inscribe al programa si hace
// falta (ignora "already_enrolled", que solo significa que ya estaba) y
// luego al grupo, en una sola accion.
function EnrollStudentModal({ session, group, programId, students, onClose, onEnrolled }) {
  const { token } = session
  const [studentId, setStudentId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleEnroll(e) {
    e.preventDefault()
    if (!studentId) return
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      try {
        await apiRequest(`/api/programs/${programId}/students`, { method: 'POST', token, body: { studentId: Number(studentId) } })
      } catch (err) {
        if (err.message !== 'already_enrolled') throw err
      }
      await apiRequest(`/api/groups/${group.id}/students`, { method: 'POST', token, body: { studentId: Number(studentId) } })
      const enrolled = students.find((s) => String(s.id) === String(studentId))
      setSuccess(`${enrolled ? enrolled.full_name : 'Alumno'} inscrito correctamente.`)
      setStudentId('')
      onEnrolled?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Inscribir alumno — ${group.name}`} onClose={onClose}>
      <form className="admin-form" onSubmit={handleEnroll}>
        <label className="full-field">Alumno
          <SearchSelect options={students} value={studentId} onChange={setStudentId} placeholder="Buscar alumno…" allowEmpty={false} />
        </label>
        <ErrorNote message={error} />
        {success && <p className="temp-password-box">{success}</p>}
        <button className="primary" disabled={saving || !studentId}>{saving ? 'Inscribiendo…' : 'Inscribir'}</button>
      </form>
    </Modal>
  )
}

function GroupsPanel({ session, component, onBack }) {
  const { token } = session
  const { items, error, loading, reload } = useList(`/api/components/${component.id}/groups`, token)
  const { items: instructors } = useList('/api/users?role=instructor', token)
  const { items: students } = useList('/api/users?role=student', token)
  const [form, setForm] = useState({ name: '', instructorId: '' })
  const [formError, setFormError] = useState('')
  const [enrollingGroup, setEnrollingGroup] = useState(null)
  const [scheduleMessage, setScheduleMessage] = useState('')
  const [view, setView] = useState(null)

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    try {
      await apiRequest(`/api/components/${component.id}/groups`, {
        method: 'POST', token, body: { name: form.name, instructorId: form.instructorId ? Number(form.instructorId) : null },
      })
      setForm({ name: '', instructorId: '' })
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  async function updateInstructor(group, instructorId) {
    try {
      await apiRequest(`/api/groups/${group.id}`, {
        method: 'PATCH', token, body: { name: group.name, instructorId: instructorId ? Number(instructorId) : null },
      })
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  async function generateSchedule(group) {
    setFormError('')
    setScheduleMessage('')
    try {
      const res = await apiRequest(`/api/groups/${group.id}/generate-schedule`, { method: 'POST', token, body: {} })
      setScheduleMessage(`${group.name}: ${res.data.topics_scheduled} tema(s) programado(s) automáticamente.`)
    } catch (err) {
      setFormError(err.message)
    }
  }

  if (view?.mode === 'schedule') {
    return <GroupHorarioPanel session={session} group={view.group} onBack={() => setView(null)} />
  }
  if (view?.mode === 'topics') {
    return <TopicsPanel session={session} group={view.group} onBack={() => setView(null)} />
  }

  return (
    <div className="admin-wrap">
      <button className="text-button crumb-back" onClick={onBack}>← Volver a programas</button>
      <section className="panel admin-form-panel">
        <h3>Nuevo grupo — {component.name}</h3>
        <p className="muted">Un componente puede dictarse en paralelo por varios grupos: misma malla, instructor y horario propios.</p>
        <form className="admin-form" onSubmit={handleCreate}>
          <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Grupo A" required /></label>
          <label>Instructor
            <SearchSelect options={instructors} value={form.instructorId} onChange={(id) => setForm({ ...form, instructorId: id })} placeholder="Buscar instructor…" />
          </label>
          <ErrorNote message={formError} />
          <button className="primary">Crear grupo</button>
        </form>
      </section>
      <section className="panel">
        <h3>Grupos de {component.name}</h3>
        <ErrorNote message={error} />
        {scheduleMessage && <p className="temp-password-box">{scheduleMessage}</p>}
        {loading ? <p className="muted">Cargando…</p> : items.length === 0 ? <p className="muted">Este componente todavía no tiene grupos.</p> : (
          <table className="admin-table">
            <thead><tr><th>Nombre</th><th>Instructor</th><th>Alumnos</th><th>Inscribir</th><th>Horario</th><th>Calendario</th><th></th></tr></thead>
            <tbody>
              {items.map((g) => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td>
                    <SearchSelect options={instructors} value={g.instructor_id || ''} onChange={(id) => updateInstructor(g, id)} placeholder="Buscar instructor…" />
                  </td>
                  <td>{g.enrolled_students}</td>
                  <td><button className="btn-mini" onClick={() => setEnrollingGroup(g)}>Inscribir</button></td>
                  <td><button className="btn-mini" onClick={() => setView({ mode: 'schedule', group: g })}>Ver horario</button></td>
                  <td><button className="btn-mini" onClick={() => generateSchedule(g)}>Generar fechas</button></td>
                  <td><button className="btn-mini" onClick={() => setView({ mode: 'topics', group: g })}>Ver temario</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {enrollingGroup && (
        <EnrollStudentModal
          session={session}
          group={enrollingGroup}
          programId={component.program_id}
          students={students}
          onClose={() => setEnrollingGroup(null)}
          onEnrolled={reload}
        />
      )}
    </div>
  )
}

function Modal({ title, onClose, children, wide, full }) {
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={full ? 'modal-panel full' : wide ? 'modal-panel wide' : 'modal-panel'}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

// Mismo sandbox que manda el servidor en la cabecera CSP: el HTML del
// material (hecho por una IA, fuera de la plataforma) corre en un origen
// opaco y no puede leer la sesion del usuario.
const MATERIAL_IFRAME_SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads'

function formatBytes(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Material de UNA clase: su tema-NN.html y, para instructor/admin, un
// boton para alternar a las respuestas (soluciones/tema-NN.html).
function MaterialViewer({ session, topic, onClose }) {
  const { token } = session
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [showSolution, setShowSolution] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiRequest(`/api/topics/${topic.id}/material`, { token })
      .then((res) => { if (!cancelled) setData(res.data) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [topic.id, token])

  const src = data?.available ? (showSolution && data.solutionUrl ? data.solutionUrl : data.url) : null

  return (
    <Modal title={`Material — ${topic.title}`} onClose={onClose} full>
      <ErrorNote message={error} />
      {!data && !error && <p className="muted">Cargando…</p>}
      {data && !data.available && (
        <p className="muted">
          {data.reason === 'no_material'
            ? 'Este componente todavía no tiene material subido.'
            : `El material subido no incluye este tema (falta tema-${pad2(data.position)}.html).`}
        </p>
      )}
      {src && (
        <>
          <div className="material-toolbar">
            {data.solutionUrl && (
              <div className="material-tabs">
                <button type="button" className={showSolution ? 'tab-button' : 'tab-button active'} onClick={() => setShowSolution(false)}>Material</button>
                <button type="button" className={showSolution ? 'tab-button active solution' : 'tab-button'} onClick={() => setShowSolution(true)}>Mostrar respuestas</button>
              </div>
            )}
            <div className="material-links">
              {data.indexUrl && <a className="btn-mini" href={data.indexUrl} target="_blank" rel="noreferrer">Índice del curso</a>}
              <a className="btn-mini" href={src} target="_blank" rel="noreferrer">Abrir en pestaña nueva</a>
            </div>
          </div>
          <iframe key={src} className="material-frame" src={src} title={`Material — ${topic.title}`} sandbox={MATERIAL_IFRAME_SANDBOX} />
        </>
      )}
    </Modal>
  )
}

// Prompt sugerido para generar TODO el material del componente con una IA
// externa, con el temario real y la numeracion que espera la subida.
// Las respuestas del formulario se recuerdan por componente en este navegador.
function MaterialPromptBuilder({ session, componentId }) {
  const { token } = session
  const storageKey = `material-prompt-options:${componentId}`
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [options, setOptions] = useState(() => {
    try { return { ...DEFAULT_PROMPT_OPTIONS, ...JSON.parse(localStorage.getItem(storageKey) || '{}') } } catch { return DEFAULT_PROMPT_OPTIONS }
  })

  useEffect(() => {
    let cancelled = false
    apiRequest(`/api/components/${componentId}/material-prompt`, { token })
      .then((res) => { if (!cancelled) setData(res.data) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [componentId, token])

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(options)) } catch { /* sin almacenamiento: solo no se recuerda */ }
  }, [storageKey, options])

  const prompt = useMemo(() => (data && data.topics.length > 0 ? buildMaterialPrompt(data, options) : ''), [data, options])
  const set = (field) => (e) => { setCopied(false); setOptions({ ...options, [field]: e.target.value }) }

  async function copyPrompt(e) {
    try {
      await navigator.clipboard.writeText(prompt)
    } catch {
      const textarea = e.currentTarget.closest('.material-prompt').querySelector('textarea.material-prompt-output')
      textarea.select()
      document.execCommand('copy')
    }
    setCopied(true)
  }

  if (error) return <ErrorNote message={error} />
  if (!data) return <p className="muted">Cargando temario…</p>
  if (data.topics.length === 0) return <p className="muted">Este componente todavía no tiene temario cargado. Cárgalo primero: el prompt se arma con los temas en orden.</p>

  return (
    <div className="material-prompt">
      <div className="tab-row material-mode">
        <button type="button" className={options.mode === 'skill' ? 'tab-button active' : 'tab-button'} onClick={() => { setCopied(false); setOptions({ ...options, mode: 'skill' }) }}>Con skill (recomendado)</button>
        <button type="button" className={options.mode === 'full' ? 'tab-button active' : 'tab-button'} onClick={() => { setCopied(false); setOptions({ ...options, mode: 'full' }) }}>Sin skill</button>
      </div>
      {options.mode === 'skill' ? (
        <ol className="material-skill-steps">
          <li>
            Solo la primera vez: <a href="/api/templates/material-skill">descarga la skill <strong>{SKILL_NAME}</strong></a> e
            instálala en Claude (Configuración → Capacidades → Skills → Subir skill). Activa también la ejecución de código y la creación de archivos.
          </li>
          <li>Completa los datos de abajo, copia el prompt y pégalo en un chat nuevo de Claude.</li>
          <li>Claude solo escribe el contenido; la skill aporta el diseño y arma un único ZIP. Es mucho más rápido y gasta menos tokens que el prompt completo.</li>
        </ol>
      ) : (
        <p className="muted">
          Prompt completo para usar Claude u otra IA sin instalar nada. Es más lento: la IA escribe todo el HTML y el CSS de cada tema.
        </p>
      )}
      <p className="muted">
        El prompt se arma con los {data.topics.length} temas del temario en orden, así que cada archivo coincidirá con su clase.
      </p>
      <div className="admin-form">
        <label className="full-field">Perfil de los alumnos
          <textarea rows={2} value={options.audience} onChange={set('audience')} placeholder="Ej.: jóvenes de 18 a 25 años, bachillerato terminado, sin experiencia previa en programación" />
        </label>
        <label>Nivel
          <select value={options.level} onChange={set('level')}>
            {MATERIAL_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label>Temas por lote
          <select value={options.batchSize} onChange={set('batchSize')}>
            <option value="auto">Automático ({suggestedBatchSize(data.topics, options.mode)})</option>
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>Sector de los ejemplos (opcional)
          <input value={options.sector} onChange={set('sector')} placeholder="Ej.: banca, retail, salud" />
        </label>
        <label>Colores / identidad (opcional)
          <input value={options.brand} onChange={set('brand')} placeholder="Ej.: azul #1b6fa8 y naranja #f0a830" />
        </label>
        <label className="full-field">Indicaciones adicionales (opcional)
          <textarea rows={2} value={options.extra} onChange={set('extra')} placeholder="Ej.: usar Python 3.12 en los ejemplos; incluir un caso integrador al final" />
        </label>
      </div>
      <div className="material-prompt-head">
        <strong>Prompt sugerido</strong>
        <button type="button" className="primary" onClick={copyPrompt}>{copied ? '¡Copiado!' : 'Copiar prompt'}</button>
      </div>
      <textarea className="material-prompt-output" readOnly rows={14} value={prompt} />
      <p className="muted material-prompt-tip">
        Con temarios largos, la IA entrega el material por lotes: escribe "continuar" hasta que entregue el ZIP. Luego súbelo aquí con "Subir ZIP".
      </p>
    </div>
  )
}

// Subida/reemplazo del ZIP de material de un componente e inventario de
// que archivo abrira cada tema. Para admins e instructores del componente.
function ComponentMaterialBox({ session, componentId }) {
  const { token } = session
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [uploading, setUploading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiRequest(`/api/components/${componentId}/material`, { token })
      .then((res) => { if (!cancelled) setInfo(res.data) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [componentId, token, reloadKey])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setNotice('')
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiUpload(`/api/components/${componentId}/material`, { token, formData })
      setNotice(`Material subido: ${res.data.topicFileCount} tema(s), ${res.data.solutionFileCount} con respuestas.`)
      setReloadKey((k) => k + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleRemove() {
    if (!window.confirm('¿Eliminar el material de este componente? Los alumnos dejarán de verlo.')) return
    setError('')
    setNotice('')
    try {
      await apiRequest(`/api/components/${componentId}/material`, { method: 'DELETE', token })
      setReloadKey((k) => k + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  const material = info?.material

  return (
    <div className="material-box">
      <p className="muted">
        Un solo ZIP por componente, con un HTML por tema (<code>tema-01.html</code>, <code>tema-02.html</code>…) y las respuestas en <code>soluciones/</code>.
        La clase N del temario de cada grupo abre <code>tema-N</code>. Los alumnos nunca reciben las soluciones.
      </p>
      <div className="excel-import-actions">
        {info?.canManage && (
          <button type="button" className={showPrompt ? 'btn-mini active' : 'btn-mini'} onClick={() => setShowPrompt((v) => !v)}>
            {showPrompt ? 'Ocultar prompt' : 'Generar prompt para IA'}
          </button>
        )}
        <a className="btn-mini" href="/api/templates/material">Descargar ZIP de ejemplo</a>
        {info?.canManage && (
          <label className="btn-mini logo-upload-label">
            {uploading ? 'Subiendo…' : material ? 'Reemplazar ZIP' : 'Subir ZIP'}
            <input type="file" accept=".zip,application/zip" onChange={handleFile} disabled={uploading} hidden />
          </label>
        )}
        {info?.canManage && material && <button type="button" className="btn-mini btn-mini-danger" onClick={handleRemove}>Eliminar material</button>}
      </div>
      {showPrompt && <MaterialPromptBuilder session={session} componentId={componentId} />}
      <ErrorNote message={error} />
      {notice && <p className="temp-password-box">{notice}</p>}
      {info && !material && <p className="muted">Todavía no hay material subido.</p>}
      {material && (
        <>
          <p className="material-meta">
            <strong>{material.originalName}</strong> · {formatBytes(material.sizeBytes)} · subido el {String(material.uploadedAt).slice(0, 16)}
            {material.uploadedByName ? ` por ${material.uploadedByName}` : ''}
          </p>
          <ul className="topic-mini-list material-file-list">
            {material.indexUrl && (
              <li><span className="topic-mini-date">Portada</span><span className="material-file">index.html</span><a className="btn-mini" href={material.indexUrl} target="_blank" rel="noreferrer">Ver</a></li>
            )}
            {material.topics.map((t) => (
              <li key={t.position}>
                <span className="topic-mini-date">Tema {t.position}</span>
                <span className="material-file">{t.file}</span>
                <a className="btn-mini" href={t.url} target="_blank" rel="noreferrer">Ver</a>
                {t.solutionUrl ? <a className="btn-mini" href={t.solutionUrl} target="_blank" rel="noreferrer">Respuestas</a> : <span className="muted">sin respuestas</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// Muestra el temario ya cargado de un grupo, de solo lectura: para que al
// editar un componente se vea de una si el import trajo lo que debia.
function ComponentGroupTopics({ session, group }) {
  const { token } = session
  const { items, loading } = useList(`/api/groups/${group.id}/topics`, token)
  return (
    <div className="component-detail-group">
      <h4>{group.name}{group.instructor_name ? ` · ${group.instructor_name}` : ' · sin instructor'}</h4>
      {loading ? <p className="muted">Cargando…</p> : items.length === 0 ? <p className="muted">Sin temario cargado.</p> : (
        <ul className="topic-mini-list">
          {items.map((t) => (
            <li key={t.id}>
              <span className="topic-mini-date">{t.scheduled_on || 'sin fecha'}</span> {t.title} <StatusPill label={t.status_label} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ComponentEditModal({ session, component, onClose, onSaved }) {
  const { token } = session
  const [form, setForm] = useState({ name: component.name, description: component.description || '', sortOrder: component.sort_order ?? 0 })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const { items: groups, loading: groupsLoading } = useList(`/api/components/${component.id}/groups`, token)

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await apiRequest(`/api/components/${component.id}`, { method: 'PATCH', token, body: form })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Editar componente — ${component.name}`} onClose={onClose} wide>
      <form className="admin-form" onSubmit={handleSave}>
        <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Orden<input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></label>
        <label className="full-field">Descripción<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <ErrorNote message={error} />
        <button className="primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
      </form>
      <hr className="modal-divider" />
      <h4 className="modal-subhead">Material del temario</h4>
      <ComponentMaterialBox session={session} componentId={component.id} />
      <hr className="modal-divider" />
      <h4 className="modal-subhead">Temario cargado</h4>
      {groupsLoading ? <p className="muted">Cargando…</p> : groups.length === 0 ? <p className="muted">Este componente todavía no tiene grupos.</p> : (
        groups.map((g) => <ComponentGroupTopics key={g.id} session={session} group={g} />)
      )}
    </Modal>
  )
}

const EMPTY_COMPONENT_FORM = { name: '', description: '', sortOrder: 0 }

function ComponentsPanel({ session, program, onBack }) {
  const { token } = session
  const { items, error, loading, reload } = useList(`/api/programs/${program.id}/components`, token)
  const [form, setForm] = useState(EMPTY_COMPONENT_FORM)
  const [formError, setFormError] = useState('')
  const [editingComponent, setEditingComponent] = useState(null)
  const [materialComponent, setMaterialComponent] = useState(null)
  const [selectedComponent, setSelectedComponent] = useState(null)
  const [showSchedule, setShowSchedule] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    try {
      await apiRequest(`/api/programs/${program.id}/components`, { method: 'POST', token, body: form })
      setForm(EMPTY_COMPONENT_FORM)
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  if (showSchedule) {
    return <ProgramSchedulePanel session={session} program={program} onBack={() => setShowSchedule(false)} />
  }
  if (selectedComponent) {
    return <GroupsPanel session={session} component={selectedComponent} onBack={() => setSelectedComponent(null)} />
  }

  return (
    <div className="admin-wrap">
      <div className="crumb-back-row">
        <button className="text-button crumb-back" onClick={onBack}>← Volver a programas</button>
        <button className="btn-mini" onClick={() => setShowSchedule(true)}>Horario semanal del programa</button>
      </div>
      <section className="panel admin-form-panel">
        <h3>Cargar la estructura completa del programa (recomendado)</h3>
        <p className="muted">Un solo Excel con componentes, temario, horario real (fecha y hora de cada clase) y feriados del tenant. Este es el formato estándar para subir un programa completo de una vez; sirve para 6, 8, 10 semanas, etc.</p>
        <FullProgramImportBox session={session} program={program} onImported={reload} />
      </section>
      <section className="panel admin-form-panel">
        <h3>Corregir el temario por Excel</h3>
        <p className="muted">Exporta el temario actual, corrige los títulos o el alcance de los temas y vuelve a cargarlo. Cada corrección se aplica al tema en todos los grupos del componente; no crea ni borra temas ni cambia fechas.</p>
        <TemarioExcelBox session={session} program={program} />
      </section>
      <section className="panel admin-form-panel">
        <h3>Nuevo componente — {program.name}</h3>
        <form className="admin-form" onSubmit={handleCreate}>
          <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="full-field">Descripción<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Orden<input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></label>
          <ErrorNote message={formError} />
          <button className="primary">Crear componente</button>
        </form>
      </section>
      <section className="panel admin-form-panel">
        <h3>Carga masiva de componentes (solo componentes, sin temario)</h3>
        <p className="muted">Varios componentes de {program.name} en un solo Excel. Cada uno crea automáticamente su "Grupo A"; el instructor es opcional.</p>
        <ExcelImportBox session={session} templateUrl="/api/templates/components" importUrl={`/api/programs/${program.id}/components/import`} onImported={reload} />
      </section>
      <section className="panel">
        <h3>Componentes</h3>
        <ErrorNote message={error} />
        {loading ? <p className="muted">Cargando…</p> : (
          <table className="admin-table">
            <thead><tr><th>Nombre</th><th>Descripción</th><th>Estado</th><th>Grupos</th><th></th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="cell-truncate" title={c.description || ''}>{c.description || '—'}</td>
                  <td><StatusPill label={c.status_label} /></td>
                  <td>{c.group_count}</td>
                  <td className="row-actions">
                    <button className="btn-mini" onClick={() => setEditingComponent(c)}>Editar</button>
                    <button className="btn-mini" onClick={() => setMaterialComponent(c)}>Material</button>
                    <button className="btn-mini" onClick={() => setSelectedComponent(c)}>Ver grupos</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {editingComponent && (
        <ComponentEditModal
          session={session}
          component={editingComponent}
          onClose={() => setEditingComponent(null)}
          onSaved={reload}
        />
      )}
      {materialComponent && (
        <Modal title={`Material — ${materialComponent.name}`} onClose={() => setMaterialComponent(null)} wide>
          <ComponentMaterialBox session={session} componentId={materialComponent.id} />
        </Modal>
      )}
    </div>
  )
}

export function ProgramsPanel({ session }) {
  const { token, profile } = session
  const isSuperAdmin = profile.roleCode === 'super_admin'
  const { items, error, loading, reload } = useList('/api/programs', token)
  const { items: tenants } = useList(isSuperAdmin ? '/api/tenants' : '', token)
  const modalities = useCatalog('CLASS_MODALITY', token)
  const programStatuses = useCatalog('PROGRAM_STATUS', token)
  const [form, setForm] = useState({ tenantId: '', name: '', description: '', cohort: '', modalityCode: '', startsOn: '', endsOn: '' })
  const [formError, setFormError] = useState('')
  const [selectedProgram, setSelectedProgram] = useState(null)

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    try {
      await apiRequest('/api/programs', {
        method: 'POST', token,
        body: { ...form, tenantId: isSuperAdmin ? (form.tenantId ? Number(form.tenantId) : null) : undefined },
      })
      setForm({ tenantId: '', name: '', description: '', cohort: '', modalityCode: '', startsOn: '', endsOn: '' })
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
          {isSuperAdmin && (
            <label>Tenant
              <select value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} required>
                <option value="">Selecciona…</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Cohorte<input value={form.cohort} onChange={(e) => setForm({ ...form, cohort: e.target.value })} placeholder="2026-1" required /></label>
          <label className="full-field">Descripción<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
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
      <section className="panel admin-form-panel">
        <h3>Carga masiva</h3>
        <p className="muted">Varios cursos en un solo Excel.{isSuperAdmin ? ' Indica el tenant por su slug en cada fila.' : ''}</p>
        <ExcelImportBox session={session} templateUrl="/api/templates/programs" importUrl="/api/programs/import" onImported={reload} />
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
  const { token, profile } = session
  const isSuperAdmin = profile.roleCode === 'super_admin'
  const { items, error, loading, reload } = useList('/api/holidays', token)
  const { items: tenants } = useList(isSuperAdmin ? '/api/tenants' : '', token)
  const types = useCatalog('HOLIDAY_TYPE', token)
  const [form, setForm] = useState({ tenantId: '', holidayOn: '', name: '', typeCode: '' })
  const [formError, setFormError] = useState('')

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    try {
      await apiRequest('/api/holidays', {
        method: 'POST', token,
        body: { ...form, tenantId: isSuperAdmin ? (form.tenantId ? Number(form.tenantId) : null) : undefined },
      })
      setForm({ tenantId: '', holidayOn: '', name: '', typeCode: '' })
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
          {isSuperAdmin && (
            <label>Tenant
              <select value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} required>
                <option value="">Selecciona…</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
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

// Por defecto todos "Presente": el instructor solo toca las filas de
// ausentes o ausentes parciales (tarde/retirado), en vez de marcar fila
// por fila. Un solo "Guardar asistencia" al final guarda todo el roster.
const DEFAULT_ATTENDANCE_STATUS = 'present'

function InstructorAttendancePanel({ session, topic, onBack }) {
  const { token } = session
  const { items, error, loading, reload } = useList(`/api/topics/${topic.id}/attendance`, token)
  const statuses = useCatalog('ATTENDANCE_STATUS', token)
  const reasons = useCatalog('ABSENCE_REASON', token)
  const [draft, setDraft] = useState({})
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState('')
  const [topicStatus, setTopicStatus] = useState(topic.status_code)
  const [completionSaving, setCompletionSaving] = useState(false)
  const [showMaterial, setShowMaterial] = useState(false)

  function statusFor(row) {
    return draft[row.student_id]?.statusCode ?? row.status_code ?? DEFAULT_ATTENDANCE_STATUS
  }

  function patch(studentId, fields) {
    setDraft((d) => ({ ...d, [studentId]: { ...d[studentId], ...fields } }))
  }

  async function saveAll() {
    setActionError('')
    setSaveResult('')
    setSaving(true)
    try {
      for (const row of items) {
        await apiRequest(`/api/topics/${topic.id}/attendance`, {
          method: 'POST', token,
          body: {
            studentId: row.student_id, statusCode: statusFor(row),
            reasonCode: draft[row.student_id]?.reasonCode ?? row.reason_code ?? null,
            observations: draft[row.student_id]?.observations ?? row.observations ?? null,
          },
        })
      }
      setSaveResult(`Asistencia guardada para ${items.length} alumno(s).`)
      reload()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function markCompletion(statusCode) {
    setCompletionSaving(true)
    setActionError('')
    try {
      await apiRequest(`/api/topics/${topic.id}/status`, {
        method: 'POST', token,
        body: { statusCode, actualDate: statusCode === 'completed' ? new Date().toISOString().slice(0, 10) : null },
      })
      setTopicStatus(statusCode)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setCompletionSaving(false)
    }
  }

  return (
    <div className="admin-wrap">
      <button className="text-button crumb-back" onClick={onBack}>← Volver al temario</button>
      <section className="panel">
        <div className="panel-title-row">
          <h3>Asistencia — {topic.title}</h3>
          <button type="button" className="btn-mini" onClick={() => setShowMaterial(true)}>Ver material</button>
        </div>
        <p className="muted">{topic.scheduled_on ? `Programado: ${topic.scheduled_on}` : 'Sin fecha programada'}</p>
        <div className="completion-check">
          <span>¿Se completó el tema en la hora asignada?</span>
          <button type="button" className={topicStatus === 'completed' ? 'tab-button active' : 'tab-button'} disabled={completionSaving} onClick={() => markCompletion('completed')}>Sí, completo</button>
          <button type="button" className={topicStatus === 'delayed' ? 'tab-button active' : 'tab-button'} disabled={completionSaving} onClick={() => markCompletion('delayed')}>No, quedó atrasado</button>
        </div>
      </section>
      <section className="panel">
        <p className="muted">Todos los alumnos empiezan como "Presente"; solo marca a los ausentes o ausentes parciales (tarde / retirado).</p>
        <ErrorNote message={error || actionError} />
        {saveResult && <p className="temp-password-box">{saveResult}</p>}
        {loading ? <p className="muted">Cargando…</p> : items.length === 0 ? <p className="muted">No hay alumnos inscritos en este componente todavía.</p> : (
          <>
            <table className="admin-table">
              <thead><tr><th>Alumno</th><th>Estado</th><th>Motivo</th><th>Observaciones</th></tr></thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.student_id}>
                    <td>{row.student_name}{row.student_is_active === false && <span className="pill pill-inactive">Inactivo</span>}</td>
                    <td>
                      <select
                        value={statusFor(row)}
                        onChange={(e) => {
                          const statusCode = e.target.value
                          patch(row.student_id, statusCode === 'present' ? { statusCode, reasonCode: '' } : { statusCode })
                        }}
                      >
                        {statuses.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        value={draft[row.student_id]?.reasonCode ?? row.reason_code ?? ''}
                        onChange={(e) => patch(row.student_id, { reasonCode: e.target.value })}
                        disabled={statusFor(row) === 'present'}
                      >
                        <option value="">—</option>
                        {reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                      </select>
                    </td>
                    <td><input placeholder="Opcional" value={draft[row.student_id]?.observations ?? row.observations ?? ''} onChange={(e) => patch(row.student_id, { observations: e.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="primary" disabled={saving} onClick={saveAll}>{saving ? 'Guardando…' : 'Guardar asistencia'}</button>
          </>
        )}
      </section>
      {showMaterial && <MaterialViewer session={session} topic={topic} onClose={() => setShowMaterial(false)} />}
    </div>
  )
}

function InstructorTopicsPanel({ session, group, onBack }) {
  const { token } = session
  const { items, error, loading } = useList(`/api/groups/${group.id}/topics`, token)
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [materialTopic, setMaterialTopic] = useState(null)

  if (selectedTopic) {
    return <InstructorAttendancePanel session={session} topic={selectedTopic} onBack={() => setSelectedTopic(null)} />
  }

  return (
    <div className="admin-wrap">
      <button className="text-button crumb-back" onClick={onBack}>← Volver a mis clases</button>
      <section className="panel">
        <h3>Temario — {group.component_name} ({group.name})</h3>
        <ErrorNote message={error} />
        {loading ? <p className="muted">Cargando…</p> : items.length === 0 ? <p className="muted">Este grupo todavía no tiene temas.</p> : (
          <table className="admin-table">
            <thead><tr><th>Título</th><th>Programado</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>{t.title}</td>
                  <td>{t.scheduled_on || '—'}</td>
                  <td><StatusPill label={t.status_label} /></td>
                  <td className="row-actions">
                    <button className="btn-mini" onClick={() => setMaterialTopic(t)}>Ver material</button>
                    <button className="btn-mini" onClick={() => setSelectedTopic(t)}>Tomar asistencia</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {materialTopic && <MaterialViewer session={session} topic={materialTopic} onClose={() => setMaterialTopic(null)} />}
    </div>
  )
}

// Calendario semanal del instructor (todas sus clases, cualquier
// componente/programa), coloreado por grupo para distinguirlas de un
// vistazo. "Hoy" vuelve a la semana actual.
function InstructorWeeklyCalendar({ session, onSelectTopic }) {
  const { token, profile } = session
  const { items: topics, loading, error } = useList('/api/my/topics', token)
  const { items: holidays } = useList(profile.tenantId ? `/api/holidays?tenantId=${profile.tenantId}` : '/api/holidays', token)
  const [weekStart, setWeekStart] = useState(null)

  useEffect(() => {
    if (weekStart === null) setWeekStart(startOfWeek(new Date().toISOString().slice(0, 10)))
  }, [weekStart])

  const colorByGroupId = useMemo(() => {
    const ids = [...new Set(topics.map((t) => t.group_id))]
    const map = new Map()
    ids.forEach((id, i) => map.set(id, GROUP_COLORS[i % GROUP_COLORS.length]))
    return map
  }, [topics])

  if (loading || !weekStart) return <p className="muted">Cargando…</p>

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const holidaySet = new Set(holidays.map((h) => h.holiday_on))
  const topicsByDate = new Map()
  topics.forEach((t) => {
    if (!t.scheduled_on) return
    if (!topicsByDate.has(t.scheduled_on)) topicsByDate.set(t.scheduled_on, [])
    topicsByDate.get(t.scheduled_on).push(t)
  })

  return (
    <section className="panel">
      <h3>Mi calendario semanal</h3>
      <div className="week-nav">
        <button className="btn-mini" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Semana anterior</button>
        <strong>{formatDayLabel(days[0])} – {formatDayLabel(days[6])}</strong>
        <button className="btn-mini" onClick={() => setWeekStart(addDays(weekStart, 7))}>Semana siguiente →</button>
        <button className="btn-mini" onClick={() => setWeekStart(startOfWeek(new Date().toISOString().slice(0, 10)))}>Hoy</button>
      </div>
      <ErrorNote message={error} />
      <div className="week-grid">
        {days.map((d) => {
          const iso = toISODate(d)
          const dayTopics = (topicsByDate.get(iso) || []).slice().sort((a, b) => a.component_name.localeCompare(b.component_name))
          const isHoliday = holidaySet.has(iso)
          return (
            <div key={iso} className={isHoliday ? 'week-day holiday' : 'week-day'}>
              <div className="week-day-head">{formatDayLabel(d)}</div>
              {isHoliday && <div className="week-day-holiday-tag">Feriado</div>}
              {dayTopics.length === 0 && !isHoliday && <p className="muted week-day-empty">Sin clases</p>}
              {dayTopics.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className="week-topic week-topic-clickable"
                  style={{ borderLeft: `3px solid ${colorByGroupId.get(t.group_id)}` }}
                  onClick={() => onSelectTopic?.(t)}
                >
                  <strong>{t.component_name}</strong>
                  <span>{t.title}</span>
                  <small>{t.group_name} · {t.program_name}</small>
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function InstructorClassesPanel({ session }) {
  const { token } = session
  const { items, error, loading } = useList('/api/my/groups', token)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [materialGroup, setMaterialGroup] = useState(null)

  if (selectedTopic) {
    return <InstructorAttendancePanel session={session} topic={selectedTopic} onBack={() => setSelectedTopic(null)} />
  }
  if (selectedGroup) {
    return <InstructorTopicsPanel session={session} group={selectedGroup} onBack={() => setSelectedGroup(null)} />
  }

  return (
    <div className="admin-wrap">
      <InstructorWeeklyCalendar session={session} onSelectTopic={setSelectedTopic} />
      <section className="panel">
        <h3>Mis grupos</h3>
        <ErrorNote message={error} />
        {loading ? <p className="muted">Cargando…</p> : items.length === 0 ? <p className="muted">Todavía no tienes grupos asignados.</p> : (
          <table className="admin-table">
            <thead><tr><th>Programa</th><th>Componente</th><th>Grupo</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {items.map((g) => (
                <tr key={g.id}>
                  <td>{g.program_name} · {g.cohort}</td>
                  <td>{g.component_name}</td>
                  <td>{g.name}</td>
                  <td><StatusPill label={g.status_label} /></td>
                  <td className="row-actions">
                    <button className="btn-mini" onClick={() => setSelectedGroup(g)}>Ver temario</button>
                    <button className="btn-mini" onClick={() => setMaterialGroup(g)}>Material</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {materialGroup && (
        <Modal title={`Material — ${materialGroup.component_name}`} onClose={() => setMaterialGroup(null)} wide>
          <ComponentMaterialBox session={session} componentId={materialGroup.component_id} />
        </Modal>
      )}
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

// "Mis temas" del alumno: todo su temario agrupado por componente, con el
// material de cada clase (sin soluciones: el servidor nunca se las entrega).
export function StudentTopicsPanel({ session }) {
  const { token } = session
  const { items, error, loading } = useList('/api/my/topics', token)
  const [materialTopic, setMaterialTopic] = useState(null)

  const groups = useMemo(() => {
    const byGroup = new Map()
    items.forEach((t) => {
      if (!byGroup.has(t.group_id)) byGroup.set(t.group_id, { ...t, topics: [] })
      byGroup.get(t.group_id).topics.push(t)
    })
    return [...byGroup.values()]
  }, [items])

  return (
    <div className="admin-wrap">
      <ErrorNote message={error} />
      {loading ? <p className="muted">Cargando…</p> : groups.length === 0 ? (
        <section className="panel"><p className="muted">Todavía no estás inscrito en ningún componente.</p></section>
      ) : groups.map((g) => (
        <section className="panel" key={g.group_id}>
          <h3>{g.component_name}</h3>
          <p className="muted">{g.program_name} · {g.group_name}{g.instructor_name ? ` · ${g.instructor_name}` : ''}</p>
          <table className="admin-table">
            <thead><tr><th>#</th><th>Tema</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {g.topics.map((t, i) => (
                <tr key={t.id}>
                  <td>{i + 1}</td>
                  <td>{t.title}</td>
                  <td>{t.scheduled_on || '—'}</td>
                  <td><StatusPill label={t.status_label} /></td>
                  <td>{t.has_material ? <button className="btn-mini" onClick={() => setMaterialTopic(t)}>Ver material</button> : <span className="muted">Sin material</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {materialTopic && <MaterialViewer session={session} topic={materialTopic} onClose={() => setMaterialTopic(null)} />}
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
  const { token, profile } = session
  const isTenantAdmin = profile.roleCode === 'tenant_admin'
  const { items: myTenant, reload: reloadTenant } = useList(isTenantAdmin ? '/api/tenants/me' : '', token)
  const tenant = isTenantAdmin ? myTenant : null
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
      {isTenantAdmin && tenant && (
        <section className="panel admin-form-panel">
          <h3>Marca de {tenant.name}</h3>
          <p className="muted">Logo y color se usan en la barra lateral y en el login propio de tu tenant.</p>
          <label>Logo</label>
          <LogoUploader
            session={session}
            tenantId={tenant.id}
            currentLogoUrl={tenant.logo_path ? `/uploads/${tenant.logo_path}` : null}
            onUploaded={reloadTenant}
          />
          <label>Color de marca</label>
          <BrandColorPicker session={session} tenantId={tenant.id} currentColor={tenant.brand_color} onSaved={reloadTenant} />
          <label>Link de acceso de tu tenant</label>
          <TenantLoginLink slug={tenant.slug} />
        </section>
      )}
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

// Banner de "proxima clase" para el instructor: lo primero que ve al
// entrar, bien llamativo, con cuenta regresiva y boton directo a la
// lista de asistencia (sin pasar por grupo -> temario).
function NextClassBanner({ session, onOpenAttendance }) {
  const { token } = session
  const { items: topics } = useList('/api/my/topics', token)
  const [, forceTick] = useState(0)

  const todayIso = new Date().toISOString().slice(0, 10)
  const next = useMemo(() => {
    return topics
      .filter((t) => t.scheduled_on && t.scheduled_on >= todayIso && t.status_code !== 'completed' && t.status_code !== 'cancelled')
      .slice()
      .sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on))[0] || null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics])

  const { items: scheduleDays } = useList(next ? `/api/groups/${next.group_id}/schedule-days` : '', token)

  // Refresca la cuenta regresiva cada minuto mientras el banner esta montado.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 60000)
    return () => clearInterval(id)
  }, [])

  if (!next) return null

  const weekday = new Date(`${next.scheduled_on}T00:00:00Z`).getUTCDay()
  const timeBlock = scheduleDays.find((d) => d.weekday === weekday)
  const daysUntil = Math.round((new Date(`${next.scheduled_on}T00:00:00Z`) - new Date(`${todayIso}T00:00:00Z`)) / 86400000)
  const whenLabel = daysUntil === 0 ? 'Hoy' : daysUntil === 1 ? 'Mañana' : `En ${daysUntil} días`

  let countdownLabel = null
  if (timeBlock) {
    const [h, m] = timeBlock.start_time.split(':').map(Number)
    const classDate = new Date(`${next.scheduled_on}T00:00:00`)
    classDate.setHours(h, m, 0, 0)
    const diffMs = classDate - new Date()
    if (diffMs > 0) {
      const hours = Math.floor(diffMs / 3600000)
      const mins = Math.round((diffMs % 3600000) / 60000)
      countdownLabel = hours > 0 ? `Faltan ${hours}h ${mins}min` : `Faltan ${mins} min`
    } else {
      countdownLabel = 'En curso o por comenzar'
    }
  }

  return (
    <section className="panel next-class-banner">
      <div className="next-class-tag">{whenLabel}</div>
      <h2>{next.title}</h2>
      <p className="next-class-sub">{next.component_name} · {next.program_name}</p>
      <div className="next-class-meta">
        <span>📅 {next.scheduled_on}</span>
        {timeBlock && <span>🕒 {timeBlock.start_time.slice(0, 5)}–{timeBlock.end_time.slice(0, 5)}</span>}
        <span>👥 {next.enrolled_students} alumno(s)</span>
        {countdownLabel && <span className="next-class-countdown">⏳ {countdownLabel}</span>}
      </div>
      <button className="primary" onClick={() => onOpenAttendance(next)}>Ver lista de asistencia</button>
    </section>
  )
}

export function RealDashboard({ session }) {
  const { token, profile } = session
  const isStudent = profile.roleCode === 'student'
  const { items: agenda, error: agendaError, loading: agendaLoading } = useList('/api/me/agenda', token)
  const [metrics, setMetrics] = useState(null)
  const [metricsError, setMetricsError] = useState('')
  const [selectedTopic, setSelectedTopic] = useState(null)

  useEffect(() => {
    let cancelled = false
    apiRequest('/api/me/metrics', { token })
      .then((res) => { if (!cancelled) setMetrics(res.data) })
      .catch((err) => { if (!cancelled) setMetricsError(err.message) })
    return () => { cancelled = true }
  }, [token])

  if (selectedTopic) {
    return <InstructorAttendancePanel session={session} topic={selectedTopic} onBack={() => setSelectedTopic(null)} />
  }

  const attendanceRate = metrics?.group_attendance_rate
  const attendanceClass = attendanceRate == null ? '' : attendanceRate >= 85 ? 'metric-good' : attendanceRate >= 70 ? 'metric-warning' : 'metric-danger'
  const delayedCount = metrics?.delayed_topics
  const delayedClass = delayedCount == null ? '' : delayedCount === 0 ? 'metric-good' : delayedCount <= 2 ? 'metric-warning' : 'metric-danger'

  return (
    <div className="admin-wrap">
      {!isStudent && <NextClassBanner session={session} onOpenAttendance={setSelectedTopic} />}
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
              <article className="metric metric-accent-blue">
                <div className="metric-head-icon"><Calendar size={16} /><span>Clases esta semana</span></div>
                <strong>{metrics?.classes_this_week ?? '—'}</strong>
              </article>
              <article className={`metric ${attendanceClass}`}>
                <div className="metric-head-icon"><UsersIcon size={16} /><span>Asistencia del grupo</span></div>
                <strong>{metrics?.group_attendance_rate ?? '—'}%</strong>
              </article>
              <article className={`metric ${delayedClass}`}>
                <div className="metric-head-icon"><AlertTriangle size={16} /><span>Temas atrasados</span></div>
                <strong>{metrics?.delayed_topics ?? '—'}</strong>
              </article>
            </>
          )}
        </div>
      </section>
      <section className="panel">
        <h3>{isStudent ? 'Próximas sesiones' : 'Tu agenda'}</h3>
        <ErrorNote message={agendaError} />
        {agendaLoading ? <p className="muted">Cargando…</p> : agenda.length === 0 ? <p className="muted">No hay temas programados próximamente.</p> : isStudent ? (
          <table className="admin-table">
            <thead><tr><th>Tema</th><th>Fecha</th><th>Componente</th><th>Instructor</th></tr></thead>
            <tbody>
              {agenda.map((t) => (
                <tr key={t.topic_id}>
                  <td>{t.title}</td>
                  <td>{t.scheduled_on}</td>
                  <td>{t.component_name} · {t.program_name}</td>
                  <td>{t.instructor_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="agenda-card-list">
            {agenda.map((t) => (
              <button
                type="button"
                key={t.topic_id}
                className="agenda-card"
                onClick={() => setSelectedTopic({ id: t.topic_id, title: t.title, scheduled_on: t.scheduled_on, status_code: t.status_code })}
              >
                <div className="agenda-card-date"><Calendar size={14} /><span>{t.scheduled_on}</span></div>
                <div className="agenda-card-body">
                  <strong>{t.title}</strong>
                  <small>{t.component_name} · {t.program_name}</small>
                </div>
                <div className="agenda-card-side">
                  <span className="agenda-card-count"><UsersIcon size={13} /> {t.enrolled_students}</span>
                  <ArrowRight size={16} />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
