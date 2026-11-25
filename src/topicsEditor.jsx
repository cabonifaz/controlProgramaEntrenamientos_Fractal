import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { RescheduleButton, ReschedulesAdminPanel } from './reschedule.jsx'
import { apiRequest } from './api'
import { ErrorNote } from './admin.jsx'
import { formatDay, programOptionLabel, withPeriod } from './progress.jsx'

// Editor de temarios (admin / super admin): agregar, editar, quitar y
// reordenar los temas de un grupo de un componente. Los temas dictados o con
// asistencia no se pueden quitar (se pueden marcar como cancelados).

// Cada tema dura 45 min de forma fija (regla del cliente), igual que el Excel.
const TOPIC_DURATION_MINUTES = 45
const EMPTY = { title: '', description: '', scheduledOn: '' }
const todayIso = () => new Date().toISOString().slice(0, 10)
const isoDay = (v) => (v ? String(v).slice(0, 10) : '')

export function TopicsEditor({ session, group, heading }) {
  const { token } = session
  const [topics, setTopics] = useState(null)
  const [statuses, setStatuses] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const current = React.useRef(group.id)
  current.current = group.id
  const load = useCallback(() => {
    const id = group.id
    apiRequest(`/api/groups/${id}/topics`, { token })
      .then(({ data }) => { if (current.current === id) setTopics(data || []) })
      .catch((err) => { if (current.current === id) setError(err.message) })
  }, [group.id, token])
  useEffect(() => { setTopics(null); setEditing(null); setError(''); setNotice(''); load() }, [load])
  useEffect(() => { apiRequest('/api/catalogs/TOPIC_STATUS', { token }).then(({ data }) => setStatuses(data || [])).catch(() => {}) }, [token])

  async function run(key, fn, okMessage) {
    setBusy(key); setError(''); setNotice('')
    try {
      await fn()
      if (okMessage) setNotice(okMessage)
      load()
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy('')
    }
  }

  async function add(e) {
    e.preventDefault()
    const title = form.title.trim()
    if (!title) return
    const ok = await run('add', () => apiRequest(`/api/groups/${group.id}/topics`, {
      method: 'POST', token, body: { title, description: form.description.trim() || null, scheduledOn: form.scheduledOn || null, durationMinutes: TOPIC_DURATION_MINUTES },
    }), `“${title}” agregado al final del temario.`)
    if (ok) setForm(EMPTY)
  }

  async function save(e) {
    e.preventDefault()
    const t = editing.original
    const title = editing.title.trim()
    if (!title) { setError('El tema no puede quedar vacío.'); return }
    const ok = await run(`save-${t.id}`, async () => {
      if (title !== t.title || (editing.description || '') !== (t.description || '')) {
        await apiRequest(`/api/topics/${t.id}`, { method: 'PUT', token, body: { title, description: editing.description } })
      }
      if (editing.scheduledOn && editing.scheduledOn !== isoDay(t.scheduled_on)) {
        await apiRequest(`/api/topics/${t.id}/reschedule`, { method: 'POST', token, body: { newDate: editing.scheduledOn } })
      }
      if (editing.statusCode && editing.statusCode !== t.status_code) {
        await apiRequest(`/api/topics/${t.id}/status`, {
          method: 'POST', token,
          body: { statusCode: editing.statusCode, actualDate: editing.statusCode === 'completed' ? (editing.scheduledOn || isoDay(t.scheduled_on) || todayIso()) : null },
        })
      }
    }, 'Tema actualizado.')
    if (ok) setEditing(null)
  }

  const move = (t, direction) => run(`move-${t.id}`, () => apiRequest(`/api/topics/${t.id}/move`, { method: 'POST', token, body: { direction } }))
  function remove(t) {
    if (!window.confirm(`¿Quitar “${t.title}” del temario?`)) return
    run(`del-${t.id}`, () => apiRequest(`/api/topics/${t.id}`, { method: 'DELETE', token }), `“${t.title}” quitado del temario.`)
  }

  const summary = useMemo(() => {
    if (!topics) return null
    return { total: topics.length, done: topics.filter((t) => t.status_code === 'completed').length, dated: topics.filter((t) => t.scheduled_on).length }
  }, [topics])

  return (
    <div className="te-wrap">
      {heading && <h3 className="te-heading">{heading}</h3>}
      <form className="te-add" onSubmit={add}>
        <h4><Plus size={16} aria-hidden="true" /> Agregar tema</h4>
        <div className="te-add-grid">
          <label className="te-title-field">Título<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={180} placeholder="Ej.: Introducción a Docker" required /></label>
          <label>Fecha (opcional)<input type="date" value={form.scheduledOn} onChange={(e) => setForm({ ...form, scheduledOn: e.target.value })} /></label>
          <label className="te-desc-field">Descripción (opcional)<textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        </div>
        <button className="primary" disabled={busy === 'add' || !form.title.trim()}>{busy === 'add' ? 'Agregando…' : 'Agregar al final'}</button>
      </form>
      {notice && <p className="temp-password-box te-notice" role="status">{notice}</p>}
      <ErrorNote message={error} />
      {topics === null ? <p className="muted">Cargando temario…</p> : topics.length === 0 ? <p className="te-empty">Este grupo todavía no tiene temas. Agrega el primero arriba o cárgalos con Excel.</p> : (
        <>
          <p className="muted te-summary">{summary.total} tema{summary.total === 1 ? '' : 's'} · {summary.done} dictado{summary.done === 1 ? '' : 's'} · {summary.dated} con fecha</p>
          <ol className="te-list">
            {topics.map((t, i) => {
              const isEditing = editing?.original.id === t.id
              const done = t.status_code === 'completed'
              return (
                <li key={t.id} className={done ? 'te-item done' : 'te-item'}>
                  <span className="te-n" aria-hidden="true">{i + 1}</span>
                  {isEditing ? (
                    <form className="te-edit" onSubmit={save}>
                      <label>Título<input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={180} required autoFocus /></label>
                      <label>Descripción<textarea rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
                      <div className="te-edit-row">
                        <label>Fecha<input type="date" value={editing.scheduledOn} onChange={(e) => setEditing({ ...editing, scheduledOn: e.target.value })} /></label>
                        <label>Estado
                          <select value={editing.statusCode} onChange={(e) => setEditing({ ...editing, statusCode: e.target.value })}>
                            {statuses.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                          </select>
                        </label>
                      </div>
                      <div className="te-edit-actions">
                        <button className="primary btn-compact" disabled={busy === `save-${t.id}`}>{busy === `save-${t.id}` ? 'Guardando…' : 'Guardar'}</button>
                        <button type="button" className="btn-mini" onClick={() => setEditing(null)}>Cancelar</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="te-body">
                        <strong>{t.title}</strong>
                        {t.description && <p className="te-desc">{t.description}</p>}
                        <span className="te-meta">{t.scheduled_on ? formatDay(isoDay(t.scheduled_on)) : 'Sin fecha'} · <span className={`te-status st-${t.status_code}`}>{t.status_label}</span></span>
                      </div>
                      <div className="te-actions">
                        <button type="button" className="te-icon" onClick={() => move(t, 'up')} disabled={i === 0 || busy !== ''} aria-label={`Subir ${t.title}`} title="Subir"><ArrowUp size={16} aria-hidden="true" /></button>
                        <button type="button" className="te-icon" onClick={() => move(t, 'down')} disabled={i === topics.length - 1 || busy !== ''} aria-label={`Bajar ${t.title}`} title="Bajar"><ArrowDown size={16} aria-hidden="true" /></button>
                        <button type="button" className="te-icon" onClick={() => setEditing({ original: t, title: t.title, description: t.description || '', scheduledOn: isoDay(t.scheduled_on), statusCode: t.status_code })} disabled={busy !== ''} aria-label={`Editar ${t.title}`} title="Editar"><Pencil size={16} aria-hidden="true" /></button>
                        {!done && t.status_code !== 'cancelled' && t.scheduled_on && <RescheduleButton session={session} topicId={t.id} className="te-icon te-resched" label="Reprogramar" onDone={load} />}
                        <button type="button" className="te-icon danger" onClick={() => remove(t)} disabled={busy !== '' || done} aria-label={`Quitar ${t.title}`} title={done ? 'Ya se dictó: no se puede quitar' : 'Quitar'}><Trash2 size={16} aria-hidden="true" /></button>
                      </div>
                    </>
                  )}
                </li>
              )
            })}
          </ol>
        </>
      )}
    </div>
  )
}

// Pantalla "Temarios" del admin: programa -> componente -> (grupo) -> editor.
export function TopicsAdminPanel({ session }) {
  const { token } = session
  const [programs, setPrograms] = useState(null)
  const [programId, setProgramId] = useState('')
  const [groups, setGroups] = useState(null)
  const [componentId, setComponentId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    apiRequest('/api/programs', { token }).then(({ data }) => {
      const list = withPeriod(data || [], todayIso()).map((p) => ({ ...(data || []).find((x) => x.id === p.id), ...p }))
      setPrograms(list)
      const first = list.find((p) => p.period !== 'closed') || list[0]
      if (first) setProgramId(String(first.id))
    }).catch((err) => setError(err.message))
  }, [token])

  useEffect(() => {
    if (!programId) return undefined
    let cancelled = false
    setGroups(null); setComponentId(''); setGroupId('')
    apiRequest(`/api/programs/${programId}/groups`, { token })
      .then(({ data }) => { if (!cancelled) setGroups(data || []) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [programId, token])

  const components = useMemo(() => {
    const list = []
    for (const g of groups || []) {
      let c = list.find((x) => x.id === g.component_id)
      if (!c) list.push((c = { id: g.component_id, name: g.component_name, groups: [] }))
      c.groups.push(g)
    }
    return list
  }, [groups])

  useEffect(() => { if (components.length && !componentId) setComponentId(String(components[0].id)) }, [components, componentId])
  const component = components.find((c) => String(c.id) === componentId)
  useEffect(() => { if (component) setGroupId(String(component.groups[0].group_id)) }, [component])
  const group = component?.groups.find((g) => String(g.group_id) === groupId)

  return (
    <div className="admin-wrap">
      <ReschedulesAdminPanel session={session} />
      <section className="panel te-panel">
        <h2 className="te-title">Temarios</h2>
        <p className="muted">Agrega, edita, ordena o quita los temas de cada componente. También puedes cargarlos con Excel desde Programas.</p>
        <ErrorNote message={error} />
        {programs === null ? <p className="muted">Cargando…</p> : programs.length === 0 ? <p className="muted">No hay programas de entrenamiento.</p> : (
          <label className="te-program">Programa
            <select value={programId} onChange={(e) => setProgramId(e.target.value)}>
              {programs.map((p) => <option key={p.id} value={String(p.id)}>{programOptionLabel(p)}</option>)}
            </select>
          </label>
        )}
        {groups && components.length === 0 && <p className="te-empty">Este programa todavía no tiene componentes. Créalos en Programas.</p>}
        {components.length > 0 && (
          <div className="te-components" role="tablist" aria-label="Componentes del programa">
            {components.map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={String(c.id) === componentId} className={String(c.id) === componentId ? 'te-chip active' : 'te-chip'} onClick={() => setComponentId(String(c.id))}>{c.name}</button>
            ))}
          </div>
        )}
        {component && component.groups.length > 1 && (
          <label className="te-program">Grupo
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {component.groups.map((g) => <option key={g.group_id} value={String(g.group_id)}>{g.group_name}{g.instructor_name ? ` · ${g.instructor_name}` : ''}</option>)}
            </select>
          </label>
        )}
      </section>
      {group && (
        <section className="panel te-panel">
          <TopicsEditor
            key={group.group_id}
            session={session}
            group={{ id: group.group_id, name: group.group_name }}
            heading={`${component.name}${component.groups.length > 1 ? ` · ${group.group_name}` : ''}${group.instructor_name ? ` — ${group.instructor_name}` : ''}`}
          />
        </section>
      )}
    </div>
  )
}
