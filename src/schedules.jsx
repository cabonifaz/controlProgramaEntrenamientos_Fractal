import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarCog, CheckCircle2, Clock, Plus, Trash2, Wand2 } from 'lucide-react'
import { apiRequest } from './api'
import { ErrorNote, Modal } from './admin.jsx'
import { formatDay, programOptionLabel, withPeriod } from './progress.jsx'

// Disponibilidad semanal de los profesores y generacion automatica de los
// horarios de un programa (dias/hora de cada grupo y fechas de sus temas,
// saltando los feriados del tenant). La logica vive en
// server/schedulePlanner.js; aqui se edita y se muestra.

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

// ===================================================================
// Editor de disponibilidad (lo usan el profesor y el admin).
export function AvailabilityEditor({ token, instructorId, initialBlocks, onSaved }) {
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
      await apiRequest(`/api/availability/${instructorId}`, { method: 'PUT', token, body: { blocks: blocks.map(({ weekday, start, end }) => ({ weekday, start, end })) } })
      setSaved('Disponibilidad guardada.')
      onSaved?.(blocks)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
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
        <span className="muted">{blocks.length ? `${hoursOf(blocks)} h por semana en ${new Set(blocks.map((b) => b.weekday)).size} día(s)` : 'Sin franjas: el generador no podrá asignarte grupos.'}</span>
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

// Profesor: "Mi disponibilidad".
export function MyAvailabilityPanel({ session }) {
  const { token, profile } = session
  const [blocks, setBlocks] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    apiRequest('/api/availability', { token })
      .then(({ data }) => setBlocks(data.find((a) => a.instructorId === profile.id)?.blocks || []))
      .catch((err) => setError(err.message))
  }, [token, profile.id])
  return (
    <div className="admin-wrap">
      <section className="panel">
        <h3>Mi disponibilidad</h3>
        <p className="muted">Indica los días y horas en que puedes dictar. El administrador genera los horarios de los cursos a partir de esta disponibilidad, sin cruzarte clases y saltando los feriados.</p>
        <ErrorNote message={error} />
        {blocks === null ? !error && <p className="muted">Cargando…</p> : <AvailabilityEditor token={token} instructorId={profile.id} initialBlocks={blocks} />}
      </section>
    </div>
  )
}

// ===================================================================
// Admin: "Horarios".
export function SchedulePlannerPanel({ session }) {
  const { token } = session
  const [programs, setPrograms] = useState(null)
  const [programId, setProgramId] = useState('')
  const [data, setData] = useState(null)
  const [availability, setAvailability] = useState([])
  const [options, setOptions] = useState({ startDate: '', sessionsPerWeek: 3, sessionMinutes: 180, mode: 'sequence' })
  const [preview, setPreview] = useState(null)
  const [applied, setApplied] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [holidayMsg, setHolidayMsg] = useState('')

  useEffect(() => {
    apiRequest('/api/programs', { token }).then(({ data }) => {
      const list = withPeriod(data || [], new Date().toISOString().slice(0, 10))
      setPrograms(list)
      setProgramId(String(list[0]?.id || ''))
    }).catch((err) => setError(err.message))
  }, [token])

  const load = useCallback(async () => {
    if (!programId) return
    setError('')
    try {
      const [planner, avail] = await Promise.all([
        apiRequest(`/api/schedule-planner/${programId}`, { token }),
        apiRequest('/api/availability', { token }),
      ])
      setData(planner.data)
      setAvailability(avail.data)
      setOptions((o) => ({ ...o, startDate: o.startDate || planner.data.defaultStart }))
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
    if (!window.confirm('Se reemplazará el horario semanal de los grupos listos y se recalcularán las fechas de sus temas pendientes o programados (los temas ya dictados no se tocan). ¿Continuar?')) return
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

  const instructorsInProgram = useMemo(() => {
    const ids = [...new Set((data?.groups || []).map((g) => g.instructorId).filter(Boolean))]
    return ids.map((id) => {
      const g = data.groups.find((x) => x.instructorId === id)
      const a = availability.find((x) => x.instructorId === id)
      return { id, name: g.instructorName, blocks: a?.blocks || [], groups: data.groups.filter((x) => x.instructorId === id).length }
    })
  }, [data, availability])
  const resultFor = (groupId) => applied?.results.find((r) => r.groupId === groupId)
  const setOpt = (k) => (e) => { setOptions({ ...options, [k]: k === 'startDate' || k === 'mode' ? e.target.value : Number(e.target.value) }); setPreview(null); setApplied(null) }

  if (!programs) return <div className="admin-wrap">{error ? <ErrorNote message={error} /> : <p className="muted">Cargando…</p>}</div>
  return (
    <div className="admin-wrap sch-wrap">
      <section className="panel">
        <div className="sch-head">
          <div>
            <h3>Generar horarios</h3>
            <p className="muted">Elige los días y la hora de cada grupo según la disponibilidad de su profesor y programa todos los temas con fecha, saltando los feriados del país.</p>
          </div>
          <label className="pf-select"><span className="sr-only">Programa</span>
            <select value={programId} onChange={(e) => setProgramId(e.target.value)}>
              {programs.map((p) => <option key={p.id} value={String(p.id)}>{programOptionLabel(p)}</option>)}
            </select>
          </label>
        </div>
        <ErrorNote message={error} />
        {!data ? <p className="muted">Cargando…</p> : (
          <>
            <ol className="sch-steps">
              <li>
                <h4><span className="sch-step-n">1</span> Profesores y su disponibilidad</h4>
                {!instructorsInProgram.length ? <p className="muted">Ningún grupo de este programa tiene profesor. Asígnalos en Programas → componente → grupos.</p> : (
                  <ul className="sch-instructors">
                    {instructorsInProgram.map((i) => (
                      <li key={i.id} className={i.blocks.length ? '' : 'missing'}>
                        <div>
                          <strong>{i.name}</strong>
                          <span className="muted">{i.groups} grupo{i.groups === 1 ? '' : 's'} · {i.blocks.length ? compactBlocks(i.blocks) : 'sin disponibilidad registrada'}</span>
                        </div>
                        <button type="button" className="btn-mini" onClick={() => setEditing(i)}><Clock size={13} aria-hidden="true" /> {i.blocks.length ? 'Editar' : 'Registrar'} disponibilidad</button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="muted sch-note">El profesor también puede registrarla desde su sección “Mi disponibilidad”. Para cambiar quién dicta un grupo, ve a Programas → componente → grupos.</p>
              </li>
              <li>
                <h4><span className="sch-step-n">2</span> Reglas del horario</h4>
                <div className="admin-form sch-options">
                  <label>Fecha de inicio<input type="date" value={options.startDate} onChange={setOpt('startDate')} /></label>
                  <label>Clases por semana
                    <select value={options.sessionsPerWeek} onChange={setOpt('sessionsPerWeek')}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                  </label>
                  <label>Duración de cada clase
                    <select value={options.sessionMinutes} onChange={setOpt('sessionMinutes')}>{[60, 90, 120, 150, 180, 240].map((n) => <option key={n} value={n}>{n >= 60 ? `${n / 60} h` : `${n} min`}{n % 60 ? '' : ''}</option>)}</select>
                  </label>
                  <label>Componentes
                    <select value={options.mode} onChange={setOpt('mode')}>
                      <option value="sequence">Uno tras otro</option>
                      <option value="parallel">Todos a la vez</option>
                    </select>
                  </label>
                </div>
              </li>
              <li>
                <h4><span className="sch-step-n">3</span> Vista previa y generación</h4>
                <div className="sch-actions">
                  <button type="button" className="btn-mini sch-preview" onClick={runPreview} disabled={busy !== ''}><CalendarCog size={15} aria-hidden="true" /> {busy === 'preview' ? 'Calculando…' : 'Ver vista previa'}</button>
                  <button type="button" className="primary sch-apply" onClick={apply} disabled={!preview || !preview.totals.ready || busy !== ''}><Wand2 size={16} aria-hidden="true" /> {busy === 'apply' ? 'Generando…' : 'Generar horarios y fechas'}</button>
                </div>
                {preview?.missingHolidayYears.length > 0 && (
                  <div className="sch-warn" role="alert">
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>No hay feriados cargados para {preview.missingHolidayYears.join(', ')}: las clases podrían caer en feriado.</span>
                    {preview.missingHolidayYears.map((y) => <button key={y} type="button" className="btn-mini" onClick={() => loadHolidays(y)}>Cargar feriados {y}</button>)}
                  </div>
                )}
                {holidayMsg && <p className="st-done" role="status">{holidayMsg}</p>}
                {applied && <p className="temp-password-box" role="status">Listo: {applied.applied} grupo{applied.applied === 1 ? '' : 's'} con horario y fechas nuevas. Revisa el resultado en Avance o en el temario de cada grupo.</p>}
                {preview && (
                  <>
                    <p className="muted sch-summary">{preview.totals.ready} de {preview.totals.groups} grupos listos · {preview.totals.topics} temas con fecha{preview.lastDate ? ` · termina el ${day(preview.lastDate)}` : ''}</p>
                    <div className="table-fit">
                      <table className="admin-table sch-table">
                        <thead><tr><th>Componente · grupo</th><th>Profesor</th><th>Días y hora</th><th>Desde – hasta</th><th>Temas</th><th>Estado</th></tr></thead>
                        <tbody>
                          {preview.plan.map((p) => {
                            const r = resultFor(p.groupId)
                            return (
                              <tr key={p.groupId}>
                                <td className="sch-name">{p.componentName}<small className="muted">{p.groupName}</small></td>
                                <td>{p.instructorName || '—'}</td>
                                <td>{p.slots.length ? slotsText(p.slots) : '—'}</td>
                                <td className="sch-dates">{p.firstDate ? `${day(p.firstDate)} – ${day(p.lastDate)}` : '—'}</td>
                                <td className="ind-n">{p.dates.length}/{p.topicsToPlan}</td>
                                <td>
                                  {r ? (r.ok ? <span className="ind-pill ind-advance">Generado</span> : <span className="ind-pill ind-unjustified">{r.skipped ? 'Omitido' : 'Error'}</span>)
                                    : p.dates.length ? <span className="ind-pill ind-advance">Listo</span> : <span className="ind-pill ind-same_day">Revisar</span>}
                                  {p.problems.map((m) => <small key={m} className="sch-problem">{m}</small>)}
                                  {r && !r.ok && r.message && <small className="sch-problem">{r.message}</small>}
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
        <Modal title={`Disponibilidad de ${editing.name}`} onClose={() => setEditing(null)} wide>
          <AvailabilityEditor token={token} instructorId={editing.id} initialBlocks={editing.blocks} onSaved={() => { load(); setPreview(null) }} />
        </Modal>
      )}
    </div>
  )
}
