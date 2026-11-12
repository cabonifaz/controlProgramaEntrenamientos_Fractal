import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, CheckCircle2, GraduationCap, Search } from 'lucide-react'
import { apiRequest } from './api'
import { ErrorNote } from './admin.jsx'
import { formatDay } from './progress.jsx'
import { slotsText } from './schedules.jsx'

// "Cursos": un profesor, admin o super admin se inscribe solo como alumno en
// grupos de programas vigentes, sin cruzar lo que ya dicta o cursa (lo valida
// el servidor). Luego cursa desde "Modo alumno".
export const STUDENT_MODE_REFRESH_EVENT = 'fractal:student-mode-refresh'
export const STUDENT_MODE_REQUEST_EVENT = 'fractal:student-mode-request'

const day = (iso) => (iso ? formatDay(iso, { weekday: false }) : '—')

export function CourseCatalogPanel({ session }) {
  const { token, profile } = session
  const isSuperAdmin = profile?.roleCode === 'super_admin'
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(null)
  const [query, setQuery] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await apiRequest('/api/me/course-catalog', { token })
      setItems(data)
      setTenantId((current) => current || String(data[0]?.tenantId || ''))
    } catch (err) {
      setError(err.message)
    }
  }, [token])
  useEffect(() => { load() }, [load])

  async function act(item, enroll) {
    if (!enroll && !window.confirm(`¿Darte de baja de ${item.componentName} · ${item.groupName}?`)) return
    setBusy(item.groupId)
    setError('')
    setNotice('')
    try {
      if (enroll) await apiRequest('/api/me/enrollments', { method: 'POST', token, body: { groupId: item.groupId } })
      else await apiRequest(`/api/me/enrollments/${item.groupId}`, { method: 'DELETE', token })
      setNotice(enroll ? `Te inscribiste en ${item.componentName} · ${item.groupName}. Para cursarlo usa “Modo alumno”.` : `Te diste de baja de ${item.componentName} · ${item.groupName}.`)
      window.dispatchEvent(new Event(STUDENT_MODE_REFRESH_EVENT))
      await load()
    } catch (err) {
      setError(err.message)
      await load()
    } finally {
      setBusy(null)
    }
  }

  const tenants = useMemo(() => {
    const map = new Map()
    for (const i of items || []) if (!map.has(i.tenantId)) map.set(i.tenantId, i.tenantName)
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [items])
  const programs = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (items || []).filter((i) => (!isSuperAdmin || String(i.tenantId) === tenantId)
      && (!onlyMine || i.enrolled)
      && (!q || `${i.programName} ${i.componentName} ${i.instructorName || ''}`.toLowerCase().includes(q)))
    const map = new Map()
    for (const i of list) {
      if (!map.has(i.programId)) map.set(i.programId, { programId: i.programId, programName: i.programName, cohort: i.cohort, startsOn: i.startsOn, endsOn: i.endsOn, groups: [] })
      map.get(i.programId).groups.push(i)
    }
    return [...map.values()]
  }, [items, query, tenantId, onlyMine, isSuperAdmin])
  const enrolledCount = (items || []).filter((i) => i.enrolled).length

  return (
    <div className="admin-wrap">
      <section className="panel">
        <div className="sch-head">
          <div>
            <h3>Cursos</h3>
            <p className="muted">Inscríbete como alumno en los cursos de los programas vigentes. No aparecen los que dictas y no puedes inscribirte en uno que se cruce con tus clases (las que dictas o las que ya cursas).</p>
          </div>
          {enrolledCount > 0 && (
            <button type="button" className="secondary cc-go" onClick={() => window.dispatchEvent(new Event(STUDENT_MODE_REQUEST_EVENT))}>
              <ArrowLeftRight size={16} aria-hidden="true" /> Cursar en modo alumno
            </button>
          )}
        </div>
        <div className="cc-filters">
          {isSuperAdmin && tenants.length > 1 && (
            <label className="pf-select"><span className="sr-only">Tenant</span>
              <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>{tenants.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}</select>
            </label>
          )}
          <label className="cc-search"><Search size={15} aria-hidden="true" /><span className="sr-only">Buscar</span>
            <input type="search" placeholder="Buscar curso, programa o profesor" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="check"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Solo mis cursos ({enrolledCount})</label>
        </div>
        {notice && <p className="temp-password-box" role="status">{notice}</p>}
        <ErrorNote message={error} />
        {items === null ? !error && <p className="muted">Cargando…</p>
          : !programs.length ? <p className="muted">{onlyMine ? 'Todavía no te inscribiste en ningún curso.' : 'No hay cursos disponibles en programas vigentes.'}</p>
          : programs.map((p) => (
            <div key={p.programId} className="cc-program">
              <h4>{p.programName}{p.cohort ? <small className="muted"> · {p.cohort}</small> : null}</h4>
              <ul className="cc-list">
                {p.groups.map((g) => (
                  <li key={g.groupId} className={g.enrolled ? 'cc-item on' : g.clashes || g.inOtherGroup ? 'cc-item blocked' : 'cc-item'}>
                    <div className="cc-info">
                      <strong>{g.componentName} <span className="muted">· {g.groupName}</span></strong>
                      <span className="muted">{g.instructorName ? `Dicta ${g.instructorName}` : 'Profesor por asignar'} · {g.schedule.length ? slotsText(g.schedule) : 'horario por definir'}</span>
                      <span className="muted">{g.firstDate ? `${day(g.firstDate)} – ${day(g.lastDate)}` : 'Fechas por definir'} · {g.topicCount} tema{g.topicCount === 1 ? '' : 's'}</span>
                    </div>
                    <div className="cc-action">
                      {g.enrolled ? (
                        <>
                          <span className="cc-chip ok"><CheckCircle2 size={14} aria-hidden="true" /> Inscrito</span>
                          <button type="button" className="btn-mini" onClick={() => act(g, false)} disabled={busy === g.groupId}>Darme de baja</button>
                        </>
                      ) : g.inOtherGroup ? (
                        <span className="cc-chip">Ya cursas otro grupo</span>
                      ) : g.clashes ? (
                        <span className="cc-chip warn"><AlertTriangle size={14} aria-hidden="true" /> Se cruza con tu horario</span>
                      ) : (
                        <button type="button" className="primary cc-enroll" onClick={() => act(g, true)} disabled={busy === g.groupId}>
                          <GraduationCap size={15} aria-hidden="true" /> {busy === g.groupId ? 'Inscribiendo…' : 'Inscribirme'}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </section>
    </div>
  )
}
