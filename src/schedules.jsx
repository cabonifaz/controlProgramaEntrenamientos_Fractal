import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarCog, CheckCircle2, Clock, Lock, LockOpen, Plus, Trash2, UserCog, Wand2 } from 'lucide-react'
import { apiRequest } from './api'
import { ErrorNote, Modal } from './admin.jsx'
import { formatDay, programOptionLabel, withPeriod } from './progress.jsx'

// Disponibilidad de los profesores POR PROGRAMA y generacion automatica de
// los horarios de un programa (dias/hora de cada grupo y fechas de sus
// temas, saltando los feriados del tenant y sin cruces). La logica vive en
// server/schedulePlanner.js; aqui se edita y se muestra. Super admin y admin
// del tenant usan la misma pantalla (el super admin elige el tenant).

const DAYS = [
  { weekday: 1, label: 'Lunes', short: 'Lun' },
  { weekday: 2, label: 'Martes', short: 'Mar' },
  { weekday: 3, label: 'Miércoles', short: 'Mié' },
  { weekday: 4, label: 'Jueves', short: 'Jue' },
  { weekday: 5, label: 'Viernes', short: 'Vie' },
  { weekday: 6, label: 'Sábado', short: 'Sáb' },
  { weekday: 0, label: 'Domingo', short: 'Dom' },
]
const SHORT = Object.fromEntries(DAYS.map((d) => [d.weekday, d.short]))
const WEEKDAYS = [1, 2, 3, 4, 5]
const PRESETS = [
  { label: 'Mañanas L–V', days: WEEKDAYS, start: '08:00', end: '13:00' },
  { label: 'Tardes L–V', days: WEEKDAYS, start: '14:00', end: '19:00' },
  { label: 'Noches L–V', days: WEEKDAYS, start: '19:00', end: '22:00' },
  { label: 'Sábados', days: [6], start: '09:00', end: '13:00' },
]
const day = (iso) => (iso ? formatDay(iso, { weekday: false }) : '—')
const when = (value) => (value ? new Date(String(value).replace(' ', 'T')).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
// withPeriod ordena (actual, proximos, pasados) pero devuelve solo lo basico: se conserva el resto.
const sortByPeriod = (list) => withPeriod(list, new Date().toISOString().slice(0, 10)).map((p) => ({ ...list.find((x) => x.id === p.id), ...p }))
export const slotsText = (slots) => (slots || []).map((s) => `${SHORT[s.weekday]} ${s.start}–${s.end}`).join(' · ')

// Disponibilidad compacta: los dias con la misma franja juntos ('Lun–Vie 08:00–13:00').
const ORDER = [1, 2, 3, 4, 5, 6, 0]
function compactBlocks(blocks) {
  const byRange = new Map()
  for (const b of blocks) {
    const key = `${b.start}–${b.end}`
    if (!byRange.has(key)) byRange.set(key, new Set())
    byRange.get(key).add(b.weekday)
  }
  return [...byRange.entries()].map(([range, set]) => {
    const runs = []
    for (const d of ORDER.filter((x) => set.has(x))) {
      const last = runs.at(-1)
      if (last && ORDER.indexOf(d) === ORDER.indexOf(last.at(-1)) + 1) last.push(d)
      else runs.push([d])
    }
    const days = runs.map((r) => (r.length > 2 ? `${SHORT[r[0]]}–${SHORT[r.at(-1)]}` : r.map((d) => SHORT[d]).join(', '))).join(', ')
    return `${days} ${range}`
  }).join(' · ')
}

function hoursOf(blocks) {
  const minutes = blocks.reduce((n, b) => {
    const [sh, sm] = b.start.split(':').map(Number)
    const [eh, em] = b.end.split(':').map(Number)
    return n + Math.max(0, eh * 60 + em - sh * 60 - sm)
  }, 0)
  return Math.round(minutes / 6) / 10
}

const windowLabel = (w) => `${w.start}–${w.end}`
const sameWindow = (a, b) => a.weekday === b.weekday && a.start === b.start && a.end === b.end

// Franjas por dia -> filas "mismos dias, mismo horario" para editarlas juntas.
function windowsToRows(windows) {
  const rows = new Map()
  for (const w of windows) {
    const key = windowLabel(w)
    if (!rows.has(key)) rows.set(key, { key, start: w.start, end: w.end, days: [] })
    rows.get(key).days.push(w.weekday)
  }
  return [...rows.values()].sort((a, b) => a.start.localeCompare(b.start))
}
const rowsToWindows = (rows) => rows.flatMap((r) => r.days.map((weekday) => ({ weekday, start: r.start, end: r.end })))

// Admin: dias y franjas horarias en que se dicta el programa.
function WindowsEditor({ token, programId, windows, locked, onSaved }) {
  const [rows, setRows] = useState(() => windowsToRows(windows).map((r, i) => ({ ...r, key: i })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  let nextKey = rows.reduce((m, r) => Math.max(m, r.key), 0) + 1
  const update = (key, patch) => { setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r))); setSaved('') }
  const toggleDay = (row, d) => update(row.key, { days: row.days.includes(d) ? row.days.filter((x) => x !== d) : [...row.days, d] })
  const add = (start = '18:30', end = '20:00', days = WEEKDAYS) => { setRows((list) => [...list, { key: nextKey++, start, end, days }]); setSaved('') }

  async function save() {
    setSaving(true)
    setError('')
    setSaved('')
    try {
      const { data } = await apiRequest(`/api/schedule-planner/${programId}/windows`, { method: 'PUT', token, body: { windows: rowsToWindows(rows) } })
      setSaved(data.availabilityRemoved ? `Franjas guardadas. Se quitaron ${data.availabilityRemoved} franja(s) de disponibilidad que quedaron fuera.` : 'Franjas guardadas.')
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (locked) return <p className="sch-windows-summary">{windows.length ? windowsToRows(windows).map((r) => `${daysText(r.days)} ${r.start}–${r.end}`).join(' · ') : 'Sin franjas: horario libre.'}</p>
  const invalid = rows.some((r) => !r.start || !r.end || r.start >= r.end || !r.days.length)
  return (
    <div className="sch-windows">
      {!rows.length && <p className="muted">Sin franjas: el generador usa cualquier hora de la disponibilidad de cada profesor. Agrega franjas para limitar los días y horas de clase.</p>}
      <ul className="sch-window-rows">
        {rows.map((r) => (
          <li key={r.key} className={r.start >= r.end || !r.days.length ? 'bad' : ''}>
            <div className="sch-window-days" role="group" aria-label="Días">
              {DAYS.map((d) => <button key={d.weekday} type="button" className={r.days.includes(d.weekday) ? 'sch-day on' : 'sch-day'} aria-pressed={r.days.includes(d.weekday)} onClick={() => toggleDay(r, d.weekday)} title={d.label}>{d.short}</button>)}
            </div>
            <span className="sch-window-time">
              <input type="time" value={r.start} onChange={(e) => update(r.key, { start: e.target.value })} aria-label="Desde" />
              <span aria-hidden="true">–</span>
              <input type="time" value={r.end} onChange={(e) => update(r.key, { end: e.target.value })} aria-label="Hasta" />
            </span>
            <button type="button" className="av-remove" onClick={() => { setRows((list) => list.filter((x) => x.key !== r.key)); setSaved('') }} aria-label="Quitar franja"><Trash2 size={14} aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
      <div className="av-presets">
        <button type="button" className="btn-mini" onClick={() => add()}><Plus size={13} aria-hidden="true" /> Franja</button>
        <button type="button" className="btn-mini" onClick={() => { setRows([{ key: nextKey++, start: '18:30', end: '20:00', days: WEEKDAYS }, { key: nextKey++, start: '20:30', end: '22:00', days: WEEKDAYS }]); setSaved('') }}>Noches L–V <small>18:30–20:00 y 20:30–22:00</small></button>
        <button type="button" className="btn-mini" onClick={() => { setRows([{ key: nextKey++, start: '09:00', end: '12:00', days: WEEKDAYS }]); setSaved('') }}>Mañanas L–V <small>09:00–12:00</small></button>
      </div>
      <div className="av-foot">
        <span className="muted">{rows.length ? `${rowsToWindows(rows).length} franja(s) por semana` : 'Horario libre'}</span>
        <div className="row-actions">
          {saved && <span className="av-saved" role="status"><CheckCircle2 size={14} aria-hidden="true" /> {saved}</span>}
          <button type="button" className="primary" onClick={save} disabled={saving || invalid}>{saving ? 'Guardando…' : 'Guardar franjas'}</button>
        </div>
      </div>
      {invalid && <p className="form-error">Cada franja necesita al menos un día y una hora de inicio menor que la de fin.</p>}
      <ErrorNote message={error} />
    </div>
  )
}
const daysText = (days) => {
  const sorted = ORDER.filter((d) => days.includes(d))
  const runs = []
  for (const d of sorted) { const last = runs.at(-1); if (last && ORDER.indexOf(d) === ORDER.indexOf(last.at(-1)) + 1) last.push(d); else runs.push([d]) }
  return runs.map((r) => (r.length > 2 ? `${SHORT[r[0]]}–${SHORT[r.at(-1)]}` : r.map((d) => SHORT[d]).join(', '))).join(', ')
}

function LockedNote({ children }) {
  return <p className="sch-locked" role="status"><Lock size={15} aria-hidden="true" /> <span>{children}</span></p>
}

// ===================================================================
// Editor de disponibilidad de un profesor en un programa (lo usan el
// profesor, el admin y el super admin). locked = horario cerrado: solo lectura.
export function AvailabilityEditor({ token, instructorId, programId, initialBlocks, onSaved, locked, windows = [] }) {
  if (windows.length && !locked) return <WindowAvailability token={token} instructorId={instructorId} programId={programId} initialBlocks={initialBlocks} onSaved={onSaved} windows={windows} />
  return <FreeAvailability token={token} instructorId={instructorId} programId={programId} initialBlocks={initialBlocks} onSaved={onSaved} locked={locked} />
}

// Con franjas de clase: el profesor marca en cuales puede (no hay horas libres).
function WindowAvailability({ token, instructorId, programId, initialBlocks, onSaved, windows }) {
  const covered = (w) => (initialBlocks || []).some((b) => b.weekday === w.weekday && b.start <= w.start && b.end >= w.end)
  const [picked, setPicked] = useState(() => windows.filter(covered))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const isOn = (w) => picked.some((p) => sameWindow(p, w))
  const toggle = (w) => { setPicked((list) => (list.some((p) => sameWindow(p, w)) ? list.filter((p) => !sameWindow(p, w)) : [...list, w])); setSaved('') }

  async function save() {
    setSaving(true)
    setError('')
    setSaved('')
    try {
      await apiRequest(`/api/availability/${instructorId}`, { method: 'PUT', token, body: { programId, blocks: picked.map(({ weekday, start, end }) => ({ weekday, start, end })) } })
      setSaved('Disponibilidad guardada.')
      onSaved?.(picked)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const days = DAYS.filter((d) => windows.some((w) => w.weekday === d.weekday))
  return (
    <div className="av-editor">
      <p className="muted av-window-help">Marca las franjas de clase del programa en las que puedes dictar.</p>
      <div className="av-presets">
        <button type="button" className="btn-mini" onClick={() => { setPicked(windows); setSaved('') }}>Marcar todas</button>
        {picked.length > 0 && <button type="button" className="btn-mini av-clear" onClick={() => { setPicked([]); setSaved('') }}>Vaciar</button>}
      </div>
      <ul className="av-days">
        {days.map((d) => (
          <li key={d.weekday} className={windows.some((w) => w.weekday === d.weekday && isOn(w)) ? 'av-day on' : 'av-day'}>
            <span className="av-day-name">{d.label}</span>
            <div className="av-blocks">
              {windows.filter((w) => w.weekday === d.weekday).map((w) => (
                <label key={windowLabel(w)} className={isOn(w) ? 'av-window on' : 'av-window'}>
                  <input type="checkbox" checked={isOn(w)} onChange={() => toggle(w)} />
                  <span>{windowLabel(w)}</span>
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="av-foot">
        <span className="muted">{picked.length ? `${picked.length} de ${windows.length} franjas` : 'Sin franjas marcadas: el generador no podrá programar sus grupos.'}</span>
        <div className="row-actions">
          {saved && <span className="av-saved" role="status"><CheckCircle2 size={14} aria-hidden="true" /> {saved}</span>}
          <button type="button" className="primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar disponibilidad'}</button>
        </div>
      </div>
      <ErrorNote message={error} />
    </div>
  )
}

function FreeAvailability({ token, instructorId, programId, initialBlocks, onSaved, locked }) {
  const [blocks, setBlocks] = useState(() => (initialBlocks || []).map((b, i) => ({ ...b, key: i })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  let nextKey = blocks.reduce((m, b) => Math.max(m, b.key), 0) + 1

  const update = (key, patch) => { setBlocks((list) => list.map((b) => (b.key === key ? { ...b, ...patch } : b))); setSaved('') }
  const remove = (key) => { setBlocks((list) => list.filter((b) => b.key !== key)); setSaved('') }
  const add = (weekday, start = '09:00', end = '12:00') => { setBlocks((list) => [...list, { key: nextKey++, weekday, start, end }]); setSaved('') }
  const applyPreset = (p) => {
    setBlocks((list) => [...list, ...p.days.filter((d) => !list.some((b) => b.weekday === d && b.start === p.start && b.end === p.end))
      .map((d) => ({ key: nextKey++, weekday: d, start: p.start, end: p.end }))])
    setSaved('')
  }

  async function save() {
    setSaving(true)
    setError('')
    setSaved('')
    try {
      await apiRequest(`/api/availability/${instructorId}`, { method: 'PUT', token, body: { programId, blocks: blocks.map(({ weekday, start, end }) => ({ weekday, start, end })) } })
      setSaved('Disponibilidad guardada.')
      onSaved?.(blocks)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (locked) {
    return (
      <div className="av-editor">
        <LockedNote>El horario de este programa ya se cerró: la disponibilidad no se puede cambiar.</LockedNote>
        <p className="av-readonly">{blocks.length ? compactBlocks(blocks) : 'No se registró disponibilidad.'}</p>
      </div>
    )
  }

  const invalid = blocks.some((b) => !b.start || !b.end || b.start >= b.end)
  return (
    <div className="av-editor">
      <div className="av-presets">
        <span className="muted">Agregar rápido:</span>
        {PRESETS.map((p) => <button key={p.label} type="button" className="btn-mini" onClick={() => applyPreset(p)}>{p.label} <small>{p.start}–{p.end}</small></button>)}
        {blocks.length > 0 && <button type="button" className="btn-mini av-clear" onClick={() => { setBlocks([]); setSaved('') }}>Vaciar</button>}
      </div>
      <ul className="av-days">
        {DAYS.map((d) => {
          const mine = blocks.filter((b) => b.weekday === d.weekday)
          return (
            <li key={d.weekday} className={mine.length ? 'av-day on' : 'av-day'}>
              <span className="av-day-name">{d.label}</span>
              <div className="av-blocks">
                {!mine.length && <span className="muted av-none">No disponible</span>}
                {mine.map((b) => (
                  <span key={b.key} className={b.start >= b.end ? 'av-block bad' : 'av-block'}>
                    <input type="time" value={b.start} onChange={(e) => update(b.key, { start: e.target.value })} aria-label={`${d.label}: desde`} />
                    <span aria-hidden="true">–</span>
                    <input type="time" value={b.end} onChange={(e) => update(b.key, { end: e.target.value })} aria-label={`${d.label}: hasta`} />
                    <button type="button" className="av-remove" onClick={() => remove(b.key)} aria-label={`Quitar franja del ${d.label}`}><Trash2 size={14} aria-hidden="true" /></button>
                  </span>
                ))}
              </div>
              <button type="button" className="btn-mini av-add" onClick={() => add(d.weekday)}><Plus size={13} aria-hidden="true" /> Franja</button>
            </li>
          )
        })}
      </ul>
      <div className="av-foot">
        <span className="muted">{blocks.length ? `${hoursOf(blocks)} h por semana en ${new Set(blocks.map((b) => b.weekday)).size} día(s)` : 'Sin franjas: el generador no podrá programar sus grupos.'}</span>
        <div className="row-actions">
          {saved && <span className="av-saved" role="status"><CheckCircle2 size={14} aria-hidden="true" /> {saved}</span>}
          <button type="button" className="primary" onClick={save} disabled={saving || invalid}>{saving ? 'Guardando…' : 'Guardar disponibilidad'}</button>
        </div>
      </div>
      {invalid && <p className="form-error">Revisa las franjas: la hora de inicio debe ser menor que la de fin.</p>}
      <ErrorNote message={error} />
    </div>
  )
}

// Profesor: "Mi disponibilidad" en cada programa donde le asignaron un curso.
export function MyAvailabilityPanel({ session }) {
  const { token, profile } = session
  const [programs, setPrograms] = useState(null)
  const [programId, setProgramId] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(() => {
    apiRequest('/api/availability', { token })
      .then(({ data }) => {
        const mine = sortByPeriod(data.filter((a) => a.instructorId === profile.id).map((a) => ({ ...a, id: a.programId, name: a.programName, starts_on: a.startsOn, ends_on: a.endsOn })))
        setPrograms(mine)
        setProgramId((current) => current || String(mine[0]?.programId || ''))
      })
      .catch((err) => setError(err.message))
  }, [token, profile.id])
  useEffect(() => { load() }, [load])
  const current = programs?.find((p) => String(p.programId) === programId)
  return (
    <div className="admin-wrap">
      <section className="panel">
        <div className="sch-head">
          <div>
            <h3>Mi disponibilidad</h3>
            <p className="muted">Indica, para cada programa, los días y horas en que puedes dictar. Con esto se genera el horario de tus cursos sin cruzarte clases y saltando los feriados. Cuando el horario se cierra, ya no se puede cambiar.</p>
          </div>
          {programs?.length > 1 && (
            <label className="pf-select"><span className="sr-only">Programa</span>
              <select value={programId} onChange={(e) => setProgramId(e.target.value)}>
                {programs.map((p) => <option key={p.programId} value={String(p.programId)}>{programOptionLabel(p)}{p.locked ? ' · cerrado' : ''}</option>)}
              </select>
            </label>
          )}
        </div>
        <ErrorNote message={error} />
        {programs === null ? !error && <p className="muted">Cargando…</p>
          : !programs.length ? <p className="muted">Aún no te asignaron cursos. Cuando el administrador te asigne uno, aquí registras tu disponibilidad para ese programa.</p>
          : current && (
            <>
              <p className="sch-program-line"><strong>{current.programName}</strong> <span className="muted">· {current.groupCount} grupo{current.groupCount === 1 ? '' : 's'} a tu cargo{current.windows?.length ? ' · clases solo en las franjas del programa' : ''}</span></p>
              <AvailabilityEditor key={current.programId} token={token} instructorId={profile.id} programId={current.programId} initialBlocks={current.blocks} locked={current.locked} windows={current.windows || []} onSaved={load} />
            </>
          )}
      </section>
    </div>
  )
}

// ===================================================================
// Admin y super admin: "Horarios".
export function SchedulePlannerPanel({ session }) {
  const { token, profile } = session
  const isSuperAdmin = profile?.roleCode === 'super_admin'
  const [programs, setPrograms] = useState(null)
  const [tenantId, setTenantId] = useState('')
  const [programId, setProgramId] = useState('')
  const [data, setData] = useState(null)
  const [options, setOptions] = useState({ startDate: '', sessionsPerWeek: 3, sessionMinutes: 180, mode: 'sequence' })
  const [preview, setPreview] = useState(null)
  const [applied, setApplied] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [holidayMsg, setHolidayMsg] = useState('')
  const [assigning, setAssigning] = useState(null)

  useEffect(() => {
    apiRequest('/api/programs', { token }).then(({ data }) => {
      const list = sortByPeriod((data || []).filter((p) => (p.program_type || 'training') === 'training' && !['archived', 'cancelled'].includes(p.status_code)))
      setPrograms(list)
      setTenantId(String(list[0]?.tenant_id || ''))
      setProgramId(String(list[0]?.id || ''))
    }).catch((err) => setError(err.message))
  }, [token])

  const tenants = useMemo(() => {
    const map = new Map()
    for (const p of programs || []) if (!map.has(p.tenant_id)) map.set(p.tenant_id, p.tenant_name || `Tenant ${p.tenant_id}`)
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [programs])
  const tenantPrograms = useMemo(() => (programs || []).filter((p) => !isSuperAdmin || String(p.tenant_id) === tenantId), [programs, tenantId, isSuperAdmin])
  function chooseTenant(id) {
    setTenantId(id)
    setProgramId(String((programs || []).find((p) => String(p.tenant_id) === id)?.id || ''))
  }

  const load = useCallback(async () => {
    if (!programId) return
    setError('')
    try {
      const { data: planner } = await apiRequest(`/api/schedule-planner/${programId}`, { token })
      setData(planner)
      setOptions((o) => ({ ...o, startDate: o.startDate || planner.defaultStart }))
    } catch (err) {
      setError(err.message)
    }
  }, [programId, token])
  useEffect(() => { setData(null); setPreview(null); setApplied(null); setOptions((o) => ({ ...o, startDate: '' })) }, [programId])
  useEffect(() => { load() }, [load])

  async function runPreview() {
    setBusy('preview')
    setError('')
    setApplied(null)
    try {
      const { data: result } = await apiRequest(`/api/schedule-planner/${programId}/preview`, { method: 'POST', token, body: options })
      setPreview(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function apply() {
    if (!window.confirm('Se reemplazará el horario semanal de los grupos listos y se fijarán las fechas de sus temas pendientes o programados (los temas ya dictados no se tocan). ¿Continuar?')) return
    setBusy('apply')
    setError('')
    try {
      const { data: result } = await apiRequest(`/api/schedule-planner/${programId}/apply`, { method: 'POST', token, body: options })
      setApplied(result)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function setClosed(closed) {
    const ask = closed
      ? 'Al cerrar el horario ya no se podrá regenerar y la disponibilidad de los profesores de este programa quedará fija. ¿Cerrar el horario?'
      : 'Al reabrir, los profesores podrán cambiar su disponibilidad y el horario se podrá volver a generar. ¿Reabrir?'
    if (!window.confirm(ask)) return
    setBusy('close')
    setError('')
    try {
      await apiRequest(`/api/schedule-planner/${programId}/close`, { method: 'POST', token, body: { closed } })
      setPreview(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function assign(group, instructorId) {
    setAssigning(group.groupId)
    setError('')
    try {
      await apiRequest(`/api/groups/${group.groupId}`, { method: 'PATCH', token, body: { name: group.groupName, instructorId: instructorId ? Number(instructorId) : null, changeReason: 'reassignment' } })
      setPreview(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setAssigning(null)
    }
  }

  async function loadHolidays(year) {
    setHolidayMsg('')
    try {
      const { data: r } = await apiRequest('/api/holidays/peru', { method: 'POST', token, body: { year, tenantId: data.tenantId } })
      setHolidayMsg(`Feriados de ${year}: ${r.added.length} agregados.`)
      await load()
      await runPreview()
    } catch (err) {
      setError(err.message)
    }
  }

  // Profesores del tenant: primero los que dictan en este programa.
  const instructors = useMemo(() => [...(data?.instructors || [])].sort((a, b) => (b.groupCount > 0) - (a.groupCount > 0) || a.instructorName.localeCompare(b.instructorName)), [data])
  const resultFor = (groupId) => applied?.results.find((r) => r.groupId === groupId)
  const setOpt = (k) => (e) => { setOptions({ ...options, [k]: k === 'startDate' || k === 'mode' ? e.target.value : Number(e.target.value) }); setPreview(null); setApplied(null) }
  const closed = data?.closed
  const unassigned = preview?.unassigned || data?.unassigned || []
  const withoutAvailability = instructors.filter((i) => i.groupCount > 0 && !i.blocks.length)

  if (!programs) return <div className="admin-wrap">{error ? <ErrorNote message={error} /> : <p className="muted">Cargando…</p>}</div>
  return (
    <div className="admin-wrap sch-wrap">
      <section className="panel">
        <div className="sch-head">
          <div>
            <h3>Generar horarios</h3>
            <p className="muted">Por programa: decide quién dicta cada curso, registra la disponibilidad de cada profesor y genera los días, la hora y las fechas de todos los temas, saltando feriados y sin cruces.</p>
          </div>
          <div className="sch-pickers">
            {isSuperAdmin && tenants.length > 0 && (
              <label className="pf-select"><span className="sr-only">Tenant</span>
                <select value={tenantId} onChange={(e) => chooseTenant(e.target.value)}>
                  {tenants.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                </select>
              </label>
            )}
            <label className="pf-select"><span className="sr-only">Programa</span>
              <select value={programId} onChange={(e) => setProgramId(e.target.value)}>
                {tenantPrograms.map((p) => <option key={p.id} value={String(p.id)}>{programOptionLabel(p)}</option>)}
              </select>
            </label>
          </div>
        </div>
        <ErrorNote message={error} />
        {!tenantPrograms.length ? <p className="muted">No hay programas de entrenamiento activos{isSuperAdmin ? ' en este tenant' : ''}.</p> : !data ? <p className="muted">Cargando…</p> : (
          <>
            {closed ? (
              <div className="sch-closed" role="status">
                <Lock size={18} aria-hidden="true" />
                <div><strong>Horario cerrado</strong><span>Lo cerró {closed.closedByName || 'un administrador'} el {when(closed.closedAt)}. La disponibilidad de los profesores de este programa ya no cambia y el horario no se regenera.</span></div>
                <button type="button" className="btn-mini" onClick={() => setClosed(false)} disabled={busy !== ''}><LockOpen size={14} aria-hidden="true" /> Reabrir</button>
              </div>
            ) : unassigned.length > 0 && (
              <div className="sch-alert" role="alert">
                <AlertTriangle size={18} aria-hidden="true" />
                <div>
                  <strong>{unassigned.length === 1 ? '1 componente sin profesor' : `${unassigned.length} componentes sin profesor`}</strong>
                  <span>No se programarán hasta que les asignes uno en el paso 1:</span>
                  <ul>{unassigned.map((u) => <li key={u.componentId}>{u.componentName}{u.groups.length > 1 ? ` (${u.groups.join(', ')})` : ''} · {u.topics} tema{u.topics === 1 ? '' : 's'}</li>)}</ul>
                </div>
              </div>
            )}
            <ol className="sch-steps">
              <li>
                <h4><span className="sch-step-n">1</span> Quién dicta cada curso</h4>
                <div className="table-fit">
                  <table className="admin-table sch-table sch-assign">
                    <thead><tr><th>Componente · grupo</th><th>Profesor</th><th>Temas</th></tr></thead>
                    <tbody>
                      {data.groups.map((g) => (
                        <tr key={g.groupId} className={g.instructorId ? '' : 'sch-row-missing'}>
                          <td className="sch-name">{g.componentName}<small className="muted">{g.groupName}</small></td>
                          <td>
                            <label className="sch-assign-select"><span className="sr-only">Profesor de {g.componentName} · {g.groupName}</span>
                              <select value={g.instructorId ? String(g.instructorId) : ''} onChange={(e) => assign(g, e.target.value)} disabled={Boolean(closed) || assigning === g.groupId}>
                                <option value="">— Sin profesor —</option>
                                {instructors.map((i) => <option key={i.instructorId} value={String(i.instructorId)}>{i.instructorName}</option>)}
                              </select>
                            </label>
                          </td>
                          <td className="ind-n">{g.topicsTotal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!instructors.length && <p className="muted sch-note">Este tenant aún no tiene profesores. Créalos en Usuarios.</p>}
              </li>
              <li>
                <h4><span className="sch-step-n">2</span> Días y horas de clase del programa</h4>
                <WindowsEditor key={`${programId}-${(data.windows || []).length}-${closed ? 1 : 0}`} token={token} programId={Number(programId)} windows={data.windows || []} locked={Boolean(closed)} onSaved={() => { load(); setPreview(null) }} />
                <p className="muted sch-note">Las clases y la disponibilidad de los profesores solo caerán en estas franjas. Cada clase dura lo que su franja.</p>
              </li>
              <li>
                <h4><span className="sch-step-n">3</span> Disponibilidad de los profesores para este programa</h4>
                {withoutAvailability.length > 0 && !closed && <p className="sch-warn"><AlertTriangle size={15} aria-hidden="true" /> Falta la disponibilidad de {withoutAvailability.map((i) => i.instructorName).join(', ')}.</p>}
                <ul className="sch-instructors">
                  {instructors.map((i) => (
                    <li key={i.instructorId} className={i.groupCount > 0 && !i.blocks.length ? 'missing' : ''}>
                      <div>
                        <strong>{i.instructorName}</strong>
                        <span className="muted">{i.groupCount ? `${i.groupCount} grupo${i.groupCount === 1 ? '' : 's'} en este programa` : 'Sin cursos en este programa'} · {i.blocks.length ? compactBlocks(i.blocks) : 'sin disponibilidad registrada'}</span>
                      </div>
                      <button type="button" className="btn-mini" onClick={() => setEditing(i)}>{closed ? <><Lock size={13} aria-hidden="true" /> Ver</> : <><Clock size={13} aria-hidden="true" /> {i.blocks.length ? 'Editar' : 'Registrar'}</>}</button>
                    </li>
                  ))}
                </ul>
                <p className="muted sch-note">Cada profesor también la registra desde su sección “Mi disponibilidad”. Al cerrar el horario, ya nadie puede cambiarla.</p>
              </li>
              <li>
                <h4><span className="sch-step-n">4</span> Reglas del horario</h4>
                <div className="admin-form sch-options">
                  <label>Fecha de inicio<input type="date" value={options.startDate} onChange={setOpt('startDate')} disabled={Boolean(closed)} /></label>
                  <label>Clases por semana
                    <select value={options.sessionsPerWeek} onChange={setOpt('sessionsPerWeek')} disabled={Boolean(closed)}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                  </label>
                  {!data.windows?.length && <label>Duración de cada clase
                    <select value={options.sessionMinutes} onChange={setOpt('sessionMinutes')} disabled={Boolean(closed)}>{[60, 90, 120, 150, 180, 240].map((n) => <option key={n} value={n}>{n / 60} h</option>)}</select>
                  </label>}
                  <label>Componentes
                    <select value={options.mode} onChange={setOpt('mode')} disabled={Boolean(closed)}>
                      <option value="sequence">Uno tras otro</option>
                      <option value="parallel">Todos a la vez</option>
                    </select>
                  </label>
                </div>
                <p className="muted sch-note">Sin cruces: un profesor nunca dicta dos clases el mismo día (en ningún programa), dos componentes del programa nunca coinciden a la misma hora y ninguna clase cae en feriado.</p>
              </li>
              <li>
                <h4><span className="sch-step-n">5</span> Vista previa, generación y cierre</h4>
                <div className="sch-actions">
                  <button type="button" className="btn-mini sch-preview" onClick={runPreview} disabled={busy !== '' || Boolean(closed)}><CalendarCog size={15} aria-hidden="true" /> {busy === 'preview' ? 'Calculando…' : 'Ver vista previa'}</button>
                  <button type="button" className="primary sch-apply" onClick={apply} disabled={!preview || !preview.totals.ready || busy !== '' || Boolean(closed)}><Wand2 size={16} aria-hidden="true" /> {busy === 'apply' ? 'Generando…' : 'Generar horarios y fechas'}</button>
                  {!closed && <button type="button" className="btn-mini sch-close" onClick={() => setClosed(true)} disabled={busy !== ''}><Lock size={14} aria-hidden="true" /> Cerrar horario</button>}
                </div>
                {preview?.missingHolidayYears.length > 0 && (
                  <div className="sch-warn" role="alert">
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>No hay feriados cargados para {preview.missingHolidayYears.join(', ')}: las clases podrían caer en feriado.</span>
                    {preview.missingHolidayYears.map((y) => <button key={y} type="button" className="btn-mini" onClick={() => loadHolidays(y)}>Cargar feriados {y}</button>)}
                  </div>
                )}
                {holidayMsg && <p className="st-done" role="status">{holidayMsg}</p>}
                {applied && (
                  <p className="temp-password-box" role="status">
                    Listo: {applied.applied} grupo{applied.applied === 1 ? '' : 's'} con horario y {applied.topicsScheduled} temas con fecha.
                    {applied.unassigned.length > 0 && ` Quedaron sin programar por no tener profesor: ${applied.unassigned.map((u) => u.componentName).join(', ')}.`}
                    {' '}Cuando estés conforme, cierra el horario.
                  </p>
                )}
                {preview && (
                  <>
                    <p className="muted sch-summary">{preview.totals.ready} de {preview.totals.groups} grupos listos · {preview.totals.topics} temas con fecha{preview.lastDate ? ` · termina el ${day(preview.lastDate)}` : ''}</p>
                    <div className="table-fit">
                      <table className="admin-table sch-table">
                        <thead><tr><th>Componente · grupo</th><th>Profesor</th><th>Días y hora</th><th>Desde – hasta</th><th>Temas</th><th>Estado</th></tr></thead>
                        <tbody>
                          {preview.plan.map((p) => {
                            const r = resultFor(p.groupId)
                            const ready = p.slots.length > 0 && p.topicsToPlan > 0 && p.dates.length === p.topicsToPlan
                            return (
                              <tr key={p.groupId}>
                                <td className="sch-name">{p.componentName}<small className="muted">{p.groupName}</small></td>
                                <td>{p.instructorName || <span className="sch-missing-name"><UserCog size={13} aria-hidden="true" /> Sin profesor</span>}</td>
                                <td>{p.slots.length ? slotsText(p.slots) : '—'}</td>
                                <td className="sch-dates">{p.firstDate ? `${day(p.firstDate)} – ${day(p.lastDate)}` : '—'}</td>
                                <td className="ind-n">{p.dates.length}/{p.topicsToPlan}</td>
                                <td>
                                  {r ? (r.ok ? <span className="ind-pill ind-advance">Generado</span> : <span className="ind-pill ind-unjustified">Omitido</span>)
                                    : ready ? <span className="ind-pill ind-advance">Listo</span> : <span className="ind-pill ind-same_day">Revisar</span>}
                                  {p.problems.map((m) => <small key={m} className="sch-problem">{m}</small>)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </li>
            </ol>
            <details className="sch-current">
              <summary>Horario actual de los grupos</summary>
              <div className="table-fit">
                <table className="admin-table sch-table">
                  <thead><tr><th>Componente · grupo</th><th>Profesor</th><th>Días y hora</th><th>Fechas</th><th>Por programar</th></tr></thead>
                  <tbody>
                    {data.groups.map((g) => (
                      <tr key={g.groupId}>
                        <td className="sch-name">{g.componentName}<small className="muted">{g.groupName}</small></td>
                        <td>{g.instructorName || '—'}</td>
                        <td>{g.schedule.length ? slotsText(g.schedule) : '—'}</td>
                        <td className="sch-dates">{g.firstDate ? `${day(g.firstDate)} – ${day(g.lastDate)}` : '—'}</td>
                        <td className="ind-n">{g.topicsToPlan}/{g.topicsTotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>
      {editing && (
        <Modal title={`Disponibilidad de ${editing.instructorName}`} onClose={() => setEditing(null)} wide>
          <AvailabilityEditor token={token} instructorId={editing.instructorId} programId={Number(programId)} initialBlocks={editing.blocks} locked={Boolean(closed)} windows={data?.windows || []} onSaved={() => { load(); setPreview(null) }} />
        </Modal>
      )}
    </div>
  )
}
