import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarX2, Plus, Search, UserX } from 'lucide-react'
import { apiRequest } from './api'
import { ErrorNote, Modal } from './admin.jsx'
import { formatDay } from './progress.jsx'

// Indicadores de inasistencias: de alumnos (a partir del registro de
// asistencia y sus avisos) y de profesores (avisos, faltas registradas por
// el admin y cambios de profesor). La "puntualidad del aviso" es la misma
// para ambos y la calcula la base (timeliness).

export const TIMELINESS = [
  { key: 'advance', label: 'Con anticipación', short: 'Anticipado' },
  { key: 'same_day', label: 'Avisó el mismo día', short: 'Mismo día' },
  { key: 'late_justified', label: 'Justificó después', short: 'Justificó después' },
  { key: 'unjustified', label: 'Sin justificar', short: 'Sin justificar' },
]
const TIMELINESS_LABEL = Object.fromEntries(TIMELINESS.map((t) => [t.key, t.label]))
export const CHANGE_REASONS = [
  { key: 'resignation', label: 'Renuncia' },
  { key: 'absences', label: 'Inasistencias' },
  { key: 'reassignment', label: 'Reasignación' },
  { key: 'performance', label: 'Desempeño' },
  { key: 'personal', label: 'Motivos personales' },
  { key: 'other', label: 'Otro' },
]
const CHANGE_LABEL = Object.fromEntries(CHANGE_REASONS.map((r) => [r.key, r.label]))
const JUSTIFICATION_LABEL = { pending: 'Por revisar', justified: 'Justificada', unjustified: 'No justificada' }

const pct = (part, whole) => (whole > 0 ? Math.round((100 * part) / whole) : null)
const day = (iso) => (iso ? formatDay(String(iso).slice(0, 10), { weekday: false }) : '—')
const when = (dt) => (dt ? new Date(dt).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
const todayIso = () => new Date().toISOString().slice(0, 10)

function countBy(events) {
  const counts = { advance: 0, same_day: 0, late_justified: 0, unjustified: 0 }
  for (const e of events) counts[e.timeliness] = (counts[e.timeliness] || 0) + 1
  return counts
}

export function TimelinessPill({ value }) {
  return <span className={`ind-pill ind-${value}`}>{TIMELINESS_LABEL[value] || value}</span>
}

function TimelinessBar({ counts, total }) {
  if (!total) return null
  return (
    <div className="ind-bar-wrap">
      <div className="ind-bar" role="img" aria-label={TIMELINESS.map((t) => `${t.label}: ${counts[t.key]}`).join(', ')}>
        {TIMELINESS.map((t) => counts[t.key] > 0 && <span key={t.key} className={`ind-seg ind-${t.key}`} style={{ flexGrow: counts[t.key] }} />)}
      </div>
      <ul className="ind-legend">
        {TIMELINESS.map((t) => <li key={t.key}><i className={`ind-dot ind-${t.key}`} aria-hidden="true" />{t.label} <b>{counts[t.key]}</b> <small>{pct(counts[t.key], total)}%</small></li>)}
      </ul>
    </div>
  )
}

function Kpi({ label, value, note, tone }) {
  return (
    <div className={tone ? `pg-stat ind-kpi ${tone}` : 'pg-stat ind-kpi'}>
      <span className="pg-stat-label">{label}</span>
      <strong>{value}</strong>
      {note && <small className="muted">{note}</small>}
    </div>
  )
}

// Celda con un numero que se apaga cuando es 0.
const N = ({ value, tone }) => <td className={value ? `ind-n ${tone || ''}` : 'ind-n zero'}>{value || 0}</td>

// ===================================================================
// Alumnos
function StudentHistory({ student, events, onClose }) {
  const counts = countBy(events)
  return (
    <Modal title={`Inasistencias de ${student.name}`} onClose={onClose} wide>
      <div className="ind-history">
        <div className="ind-history-stats">
          <Kpi label="Asistencia" value={student.attendancePct === null ? '—' : `${student.attendancePct}%`} note={`${student.attended} de ${student.sessions} sesiones`} />
          <Kpi label="Inasistencias" value={events.length} note={`${counts.advance} con anticipación`} />
          <Kpi label="Sin justificar" value={counts.unjustified} tone={counts.unjustified ? 'danger' : ''} />
        </div>
        <TimelinessBar counts={counts} total={events.length} />
        {!events.length ? <p className="muted">Sin inasistencias registradas.</p> : (
          <ol className="ind-timeline">
            {events.map((e) => (
              <li key={e.attendance_id}>
                <span className="ind-tl-date">{day(e.class_on)}</span>
                <div>
                  <strong>{e.topic_title}</strong>
                  <span className="muted">{e.component_name} · {e.instructor_name || 'Sin profesor'}</span>
                  <span className="ind-tl-tags"><TimelinessPill value={e.timeliness} /><span className="pill">{e.attendance_label}</span>{e.leave_created_at && <small className="muted">Avisó el {when(e.leave_created_at)}</small>}</span>
                  {e.leave_reason && <p className="ind-reason">“{e.leave_reason}”</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  )
}

function StudentsTab({ token }) {
  const [data, setData] = useState(null)
  const [leaves, setLeaves] = useState([])
  const [error, setError] = useState('')
  const [programId, setProgramId] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    apiRequest('/api/indicators/students', { token }).then(({ data }) => setData(data)).catch((err) => setError(err.message))
    apiRequest('/api/leave-requests', { token }).then(({ data }) => setLeaves(data || [])).catch(() => {})
  }, [token])

  const programs = useMemo(() => [...new Map((data?.events || []).map((e) => [e.program_id, e.program_name])).entries()], [data])
  const events = useMemo(() => (data?.events || []).filter((e) => !programId || String(e.program_id) === programId), [data, programId])
  const counts = countBy(events)
  const today = todayIso()
  const upcoming = leaves.filter((l) => ['pending', 'approved'].includes(l.status_code) && String(l.starts_on).slice(0, 10) >= today)

  const students = useMemo(() => {
    const map = new Map()
    for (const t of data?.totals || []) {
      const sessions = Number(t.sessions) || 0
      const attended = Number(t.attended) || 0
      map.set(t.student_id, { id: t.student_id, name: t.student_name, sessions, attended, attendancePct: pct(attended, sessions), events: [] })
    }
    for (const e of events) {
      if (!map.has(e.student_id)) map.set(e.student_id, { id: e.student_id, name: e.student_name, sessions: 0, attended: 0, attendancePct: null, events: [] })
      map.get(e.student_id).events.push(e)
    }
    const q = query.trim().toLowerCase()
    return [...map.values()]
      .map((s) => ({ ...s, counts: countBy(s.events), last: s.events[0]?.class_on || null }))
      .filter((s) => (programId ? s.events.length > 0 : true) && (!q || s.name.toLowerCase().includes(q)))
      .sort((a, b) => b.counts.unjustified - a.counts.unjustified || b.events.length - a.events.length || a.name.localeCompare(b.name, 'es'))
  }, [data, events, query, programId])

  if (error) return <ErrorNote message={error} />
  if (!data) return <p className="muted">Cargando…</p>
  return (
    <div className="ind-tab">
      <div className="ind-toolbar">
        <label className="pf-search"><Search size={15} aria-hidden="true" /><span className="sr-only">Buscar alumno</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar alumno…" />
        </label>
        {programs.length > 1 && (
          <label className="pf-select"><span className="sr-only">Programa</span>
            <select value={programId} onChange={(e) => setProgramId(e.target.value)}>
              <option value="">Todos los programas</option>
              {programs.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="ind-kpis">
        <Kpi label="Inasistencias" value={events.length} note={`${students.filter((s) => s.events.length).length} alumnos con al menos una`} />
        <Kpi label="Con anticipación" value={`${pct(counts.advance, events.length) ?? 0}%`} note={`${counts.advance} avisaron antes de la clase`} tone="ok" />
        <Kpi label="Justificó después" value={counts.late_justified + counts.same_day} note={`${counts.same_day} el mismo día · ${counts.late_justified} después`} tone="warn" />
        <Kpi label="Sin justificar" value={counts.unjustified} note="faltaron sin aviso ni justificación" tone={counts.unjustified ? 'danger' : ''} />
        <Kpi label="Avisos próximos" value={upcoming.length} note="para clases que vienen" />
      </div>
      <TimelinessBar counts={counts} total={events.length} />

      <div className="ind-grid">
        <section className="ind-card">
          <h4>Por alumno</h4>
          {!students.length ? <p className="muted">Sin datos.</p> : (
            <div className="table-fit">
              <table className="admin-table ind-table">
                <thead><tr><th>Alumno</th><th>Asistencia</th><th>Faltas</th><th title="Con anticipación">Anticip.</th><th title="Avisó el mismo día">Mismo día</th><th title="Justificó después">Justif. después</th><th>Sin justificar</th><th>Última</th><th><span className="sr-only">Acciones</span></th></tr></thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td className="ind-name">{s.name}</td>
                      <td className={s.attendancePct !== null && s.attendancePct < 80 ? 'ind-n danger' : 'ind-n'}>{s.attendancePct === null ? '—' : `${s.attendancePct}%`}</td>
                      <N value={s.events.length} />
                      <N value={s.counts.advance} tone="ok" />
                      <N value={s.counts.same_day} tone="warn" />
                      <N value={s.counts.late_justified} tone="warn" />
                      <N value={s.counts.unjustified} tone="danger" />
                      <td className="ind-date">{s.last ? day(s.last) : '—'}</td>
                      <td className="row-actions">{s.events.length > 0 && <button type="button" className="btn-mini" onClick={() => setOpen(s)}>Historial</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="ind-card">
          <h4>Más recientes</h4>
          {!events.length ? <p className="muted">Sin inasistencias registradas.</p> : (
            <ul className="ind-recent">
              {events.slice(0, 8).map((e) => (
                <li key={e.attendance_id}>
                  <span className="ind-tl-date">{day(e.class_on)}</span>
                  <div><strong>{e.student_name}</strong><span className="muted">{e.topic_title} · {e.component_name}</span><TimelinessPill value={e.timeliness} /></div>
                </li>
              ))}
            </ul>
          )}
          {upcoming.length > 0 && (
            <>
              <h4 className="ind-sub">Avisos para clases próximas</h4>
              <ul className="ind-recent">
                {upcoming.slice(0, 6).map((l) => (
                  <li key={l.id}>
                    <span className="ind-tl-date">{day(l.starts_on)}</span>
                    <div><strong>{l.student_name}</strong><span className="muted">{l.topic_title || 'Permiso por fechas'}{l.component_name ? ` · ${l.component_name}` : ''}</span><span className="ind-pill ind-advance">{l.status_label}</span></div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
      {open && <StudentHistory student={open} events={open.events} onClose={() => setOpen(null)} />}
    </div>
  )
}

// ===================================================================
// Profesores
function RegisterAbsenceModal({ token, onClose, onSaved }) {
  const [classes, setClasses] = useState(null)
  const [instructorId, setInstructorId] = useState('')
  const [form, setForm] = useState({ topicId: '', reason: '', notified: 'no', notifiedAt: '', justification: 'pending' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    apiRequest('/api/instructor-absences/classes', { token }).then(({ data }) => setClasses(data)).catch((err) => setError(err.message))
  }, [token])

  const instructors = useMemo(() => [...new Map((classes || []).map((c) => [c.instructor_id, c.instructor_name])).entries()], [classes])
  const options = (classes || []).filter((c) => String(c.instructor_id) === instructorId)

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiRequest('/api/instructor-absences', {
        method: 'POST', token,
        body: {
          topicId: Number(form.topicId), reason: form.reason.trim(), justification: form.justification,
          notifiedAt: form.notified === 'yes' && form.notifiedAt ? form.notifiedAt : null,
        },
      })
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Registrar inasistencia de profesor" onClose={onClose} wide>
      {!classes && !error && <p className="muted">Cargando clases…</p>}
      {classes && (
        <form className="admin-form ind-form" onSubmit={save}>
          <label>Profesor
            <select value={instructorId} onChange={(e) => { setInstructorId(e.target.value); setForm({ ...form, topicId: '' }) }} required>
              <option value="">Elige un profesor</option>
              {instructors.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
            </select>
          </label>
          <label>Clase a la que faltó
            <select value={form.topicId} onChange={(e) => setForm({ ...form, topicId: e.target.value })} required disabled={!instructorId}>
              <option value="">{instructorId ? 'Elige la clase' : 'Primero elige el profesor'}</option>
              {options.map((c) => <option key={c.topic_id} value={String(c.topic_id)}>{day(c.scheduled_on)} · {c.component_name} · {c.topic_title}</option>)}
            </select>
          </label>
          <label className="full-field">Motivo<textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={500} required placeholder="Ej.: enfermedad, renunció sin aviso…" /></label>
          <fieldset className="full-field ind-fieldset">
            <legend>¿Avisó antes de faltar?</legend>
            <label className="checkbox-field"><input type="radio" name="notified" checked={form.notified === 'no'} onChange={() => setForm({ ...form, notified: 'no' })} /> No avisó</label>
            <label className="checkbox-field"><input type="radio" name="notified" checked={form.notified === 'yes'} onChange={() => setForm({ ...form, notified: 'yes' })} /> Sí, avisó el</label>
            {form.notified === 'yes' && <input type="datetime-local" value={form.notifiedAt} onChange={(e) => setForm({ ...form, notifiedAt: e.target.value })} required aria-label="Fecha y hora del aviso" />}
          </fieldset>
          <label>Justificación
            <select value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value })}>
              <option value="pending">Por revisar</option>
              <option value="justified">Justificada</option>
              <option value="unjustified">No justificada</option>
            </select>
          </label>
          <ErrorNote message={error} />
          <button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Registrar inasistencia'}</button>
        </form>
      )}
      {error && !classes && <ErrorNote message={error} />}
    </Modal>
  )
}

function InstructorsTab({ token }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [registering, setRegistering] = useState(false)
  const [actionError, setActionError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    apiRequest('/api/indicators/instructors', { token }).then(({ data }) => setData(data)).catch((err) => setError(err.message))
  }, [token, reload])

  async function resolve(absence, justification) {
    setActionError('')
    try {
      await apiRequest(`/api/instructor-absences/${absence.id}/resolve`, { method: 'POST', token, body: { justification } })
      setReload((k) => k + 1)
    } catch (err) {
      setActionError(err.message)
    }
  }
  async function remove(absence) {
    if (!window.confirm(`¿Anular el registro de inasistencia de ${absence.instructor_name} del ${day(absence.absence_on)}?`)) return
    setActionError('')
    try {
      await apiRequest(`/api/instructor-absences/${absence.id}/cancel`, { method: 'POST', token })
      setReload((k) => k + 1)
    } catch (err) {
      setActionError(err.message)
    }
  }

  if (error) return <ErrorNote message={error} />
  if (!data) return <p className="muted">Cargando…</p>
  const { absences, changes } = data
  const counts = countBy(absences)
  const pending = absences.filter((a) => a.justification === 'pending')
  const resignations = changes.filter((c) => c.reason_code === 'resignation').length
  const rows = data.instructors.map((i) => {
    const mine = absences.filter((a) => a.instructor_id === i.instructor_id)
    const exits = changes.filter((c) => c.previous_instructor_id === i.instructor_id)
    const c = countBy(mine)
    return { ...i, absences: mine, counts: c, exits, resigned: exits.some((x) => x.reason_code === 'resignation'), punctuality: pct(c.advance, mine.length) }
  }).sort((a, b) => b.counts.unjustified - a.counts.unjustified || b.absences.length - a.absences.length || a.instructor_name.localeCompare(b.instructor_name, 'es'))

  return (
    <div className="ind-tab">
      <div className="ind-toolbar">
        <p className="muted">Faltas de profesores: las que avisaron desde la app y las que registra el administrador.</p>
        <button type="button" className="primary ind-add" onClick={() => setRegistering(true)}><Plus size={16} aria-hidden="true" /> Registrar inasistencia</button>
      </div>
      <div className="ind-kpis">
        <Kpi label="Inasistencias" value={absences.length} note={`${rows.filter((r) => r.absences.length).length} profesores con al menos una`} />
        <Kpi label="Con anticipación" value={`${pct(counts.advance, absences.length) ?? 0}%`} note={`${counts.advance} avisaron antes de la clase`} tone="ok" />
        <Kpi label="Sin justificar" value={counts.unjustified} note={`${counts.late_justified} justificaron después`} tone={counts.unjustified ? 'danger' : ''} />
        <Kpi label="Por revisar" value={pending.length} note="pendientes de justificar" tone={pending.length ? 'warn' : ''} />
        <Kpi label="Cambios de profesor" value={changes.length} note={`${resignations} por renuncia`} />
      </div>
      <TimelinessBar counts={counts} total={absences.length} />
      <ErrorNote message={actionError} />

      <section className="ind-card">
        <h4>Por profesor</h4>
        <div className="table-fit">
          <table className="admin-table ind-table">
            <thead><tr><th>Profesor</th><th>Clases</th><th>Faltas</th><th title="Con anticipación">Anticip.</th><th title="Avisó el mismo día">Mismo día</th><th title="Justificó después">Justif. después</th><th>Sin justificar</th><th title="Grupos que dejó (cambios de profesor)">Salidas</th><th title="Porcentaje de faltas avisadas con anticipación">Puntualidad del aviso</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.instructor_id}>
                  <td className="ind-name">{r.instructor_name}{r.resigned && <span className="ind-pill ind-unjustified">Renunció</span>}{!r.is_active && <span className="pill pill-inactive">Inactivo</span>}</td>
                  <td className="ind-n" title={`${r.topics_completed} dictadas de ${r.topics_past} con fecha pasada · ${r.topics_total} en total`}>{r.topics_completed}/{r.topics_past}</td>
                  <N value={r.absences.length} />
                  <N value={r.counts.advance} tone="ok" />
                  <N value={r.counts.same_day} tone="warn" />
                  <N value={r.counts.late_justified} tone="warn" />
                  <N value={r.counts.unjustified} tone="danger" />
                  <N value={r.exits.length} tone="warn" />
                  <td className="ind-n">{r.punctuality === null ? '—' : `${r.punctuality}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ind-card">
        <h4>Inasistencias registradas</h4>
        {!absences.length ? <p className="muted">Todavía no hay inasistencias de profesores.</p> : (
          <div className="table-fit">
            <table className="admin-table ind-table">
              <thead><tr><th>Fecha</th><th>Profesor</th><th>Clase</th><th>Aviso</th><th>Justificación</th><th>Motivo</th><th><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody>
                {absences.map((a) => (
                  <tr key={a.id}>
                    <td className="ind-date">{day(a.absence_on)}</td>
                    <td className="ind-name">{a.instructor_name}</td>
                    <td>{a.topic_title}<small className="muted ind-block">{a.component_name} · {a.group_name}</small></td>
                    <td><TimelinessPill value={a.timeliness} />{a.notified_at && <small className="muted ind-block">{a.source === 'instructor' ? 'Desde la app' : 'Avisó'} · {when(a.notified_at)}</small>}</td>
                    <td><span className={`ind-pill ind-j-${a.justification}`}>{JUSTIFICATION_LABEL[a.justification]}</span></td>
                    <td className="ind-reason-cell">{a.reason}</td>
                    <td className="row-actions stack">
                      {a.justification !== 'justified' && <button type="button" className="btn-mini" onClick={() => resolve(a, 'justified')}>Justificada</button>}
                      {a.justification !== 'unjustified' && <button type="button" className="btn-mini" onClick={() => resolve(a, 'unjustified')}>No justificada</button>}
                      <button type="button" className="btn-mini" onClick={() => remove(a)}>Anular</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {registering && <RegisterAbsenceModal token={token} onClose={() => setRegistering(false)} onSaved={() => { setRegistering(false); setReload((k) => k + 1) }} />}
    </div>
  )
}

// ===================================================================
// Cambios de profesor
function ChangesTab({ token }) {
  const [changes, setChanges] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    apiRequest('/api/instructor-changes', { token }).then(({ data }) => setChanges(data)).catch((err) => setError(err.message))
  }, [token])
  if (error) return <ErrorNote message={error} />
  if (!changes) return <p className="muted">Cargando…</p>
  const byReason = CHANGE_REASONS.map((r) => ({ ...r, n: changes.filter((c) => c.reason_code === r.key).length })).filter((r) => r.n)
  return (
    <div className="ind-tab">
      <p className="muted">Cada vez que un grupo cambia de profesor queda aquí, con el motivo. Se registra desde Programas → componente → grupos.</p>
      {byReason.length > 0 && <div className="ind-reasons">{byReason.map((r) => <span key={r.key} className={`ind-pill ind-r-${r.key}`}>{r.label} <b>{r.n}</b></span>)}</div>}
      {!changes.length ? <p className="muted">Todavía no hay cambios de profesor.</p> : (
        <div className="table-fit">
          <table className="admin-table ind-table">
            <thead><tr><th>Desde</th><th>Curso · grupo</th><th>Sale</th><th>Entra</th><th>Motivo</th><th>Nota</th><th>Registró</th></tr></thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id}>
                  <td className="ind-date">{day(c.effective_on)}</td>
                  <td>{c.component_name}<small className="muted ind-block">{c.group_name} · {c.program_name}</small></td>
                  <td className="ind-name">{c.previous_instructor_name}</td>
                  <td>{c.new_instructor_name || <span className="muted">Sin profesor</span>}</td>
                  <td><span className={`ind-pill ind-r-${c.reason_code}`}>{CHANGE_LABEL[c.reason_code]}</span></td>
                  <td className="ind-reason-cell">{c.note || '—'}</td>
                  <td>{c.created_by_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const TABS = [['students', 'Alumnos'], ['instructors', 'Profesores'], ['changes', 'Cambios de profesor']]

export function AbsencesPanel({ session }) {
  const [tab, setTab] = useState('students')
  return (
    <div className="admin-wrap ind-wrap">
      <section className="panel">
        <h3>Inasistencias e indicadores</h3>
        <p className="muted">Faltas de alumnos y profesores: si avisaron con anticipación, justificaron después o no justificaron; y los cambios de profesor.</p>
        <div className="pg-tabs" role="tablist" aria-label="Indicadores">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'pg-tab active' : 'pg-tab'} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
        {tab === 'students' && <StudentsTab token={session.token} />}
        {tab === 'instructors' && <InstructorsTab token={session.token} />}
        {tab === 'changes' && <ChangesTab token={session.token} />}
      </section>
    </div>
  )
}

// ===================================================================
// Profesor: sus avisos de inasistencia.
export function useMyInstructorAbsences(token, enabled = true) {
  const [items, setItems] = useState([])
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!enabled) return
    apiRequest('/api/instructor-absences', { token }).then(({ data }) => setItems(data || [])).catch(() => {})
  }, [token, enabled, version])
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { items, reload }
}

// Aviso del profesor para una clase que todavia no pasa.
export function InstructorAbsenceNotice({ token, topic, today, absence, onChanged }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  async function send(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiRequest('/api/instructor-absences', { method: 'POST', token, body: { topicId: topic.id, reason: reason.trim() } })
      setDone('Listo. El administrador recibió tu aviso.')
      setOpen(false)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  async function cancel() {
    setBusy(true)
    setError('')
    try {
      await apiRequest(`/api/instructor-absences/${absence.id}/cancel`, { method: 'POST', token })
      setDone('Retiraste tu aviso.')
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const upcoming = topic.scheduledOn && topic.scheduledOn >= today
  if (!absence && !upcoming) return null
  return (
    <section className="ind-notice">
      {done && <p className="st-done" role="status">{done}</p>}
      <ErrorNote message={error} />
      {absence ? (
        <div className="ind-notice-row">
          <span className="ind-pill ind-same_day"><CalendarX2 size={13} aria-hidden="true" /> Avisaste que no dictarás esta clase</span>
          <span className="muted">{when(absence.notified_at)} · {JUSTIFICATION_LABEL[absence.justification]}</span>
          {upcoming && <button type="button" className="btn-mini" onClick={cancel} disabled={busy}>Retirar aviso</button>}
        </div>
      ) : open ? (
        <form className="st-notice-form" onSubmit={send}>
          <h4>Avisar que no podré dictar esta clase</h4>
          <p className="muted">Le llega al administrador como alerta. Avisar con anticipación cuenta en tus indicadores.</p>
          <label>Motivo<textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required placeholder="Ej.: cita médica" /></label>
          <div className="st-form-actions">
            <button type="submit" className="primary" disabled={busy || !reason.trim()}>{busy ? 'Enviando…' : 'Enviar aviso'}</button>
            <button type="button" className="btn-mini" onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn-mini" onClick={() => { setOpen(true); setDone('') }}><UserX size={14} aria-hidden="true" /> Avisar que no podré dictar esta clase</button>
      )}
    </section>
  )
}

// Lista de avisos propios (en Permisos del profesor).
export function MyInstructorAbsences({ token }) {
  const { items, reload } = useMyInstructorAbsences(token)
  const [error, setError] = useState('')
  const today = todayIso()
  async function cancel(a) {
    setError('')
    try {
      await apiRequest(`/api/instructor-absences/${a.id}/cancel`, { method: 'POST', token })
      reload()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <section className="panel">
      <h3>Mis avisos de inasistencia</h3>
      <p className="muted">Para avisar que no dictarás una clase, ábrela desde <b>Avance</b>. El aviso le llega al administrador.</p>
      <ErrorNote message={error} />
      {!items.length ? <p className="muted">No tienes avisos registrados.</p> : (
        <table className="admin-table">
          <thead><tr><th>Fecha</th><th>Clase</th><th>Aviso</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td>{day(a.absence_on)}</td>
                <td>{a.topic_title}<small className="muted ind-block">{a.component_name}</small></td>
                <td><TimelinessPill value={a.timeliness} /></td>
                <td><span className={`ind-pill ind-j-${a.justification}`}>{JUSTIFICATION_LABEL[a.justification]}</span></td>
                <td className="row-actions">{String(a.absence_on).slice(0, 10) >= today && a.source === 'instructor' && <button type="button" className="btn-mini" onClick={() => cancel(a)}>Retirar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
