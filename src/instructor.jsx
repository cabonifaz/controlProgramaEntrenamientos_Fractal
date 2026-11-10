import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, CalendarClock, Clapperboard, ClipboardCheck, FileText, UserX, Video } from 'lucide-react'
import { apiRequest } from './api'
import { ErrorNote, InstructorAttendancePanel, MaterialViewer, Modal } from './admin.jsx'
import { AttendanceGrid, PERIOD_LABEL, ProgressBar, classWhen, programOptionLabel } from './progress.jsx'
import { ReactionChip, useReactionSummary } from './satisfaction.jsx'
import { ClassroomPanel } from './classroom.jsx'

// Temarios y Asistencia del profesor. Usan el mismo tablero de Avance
// (GET /api/progress, solo sus grupos): eligen programa (el actual por
// defecto) y grupo, y desde aqui se registra asistencia y se abre el
// material de cada tema.

const STATE = {
  completed: { label: 'Dictado', tone: 'ok' },
  in_progress: { label: 'Hoy / en curso', tone: 'info' },
  scheduled: { label: 'Programado', tone: '' },
  delayed: { label: 'Atrasado', tone: 'danger' },
  pending: { label: 'Sin fecha', tone: '' },
}
const percent = (part, whole) => (whole > 0 ? Math.round((100 * part) / whole) : null)

function useInstructorBoard(token) {
  const [board, setBoard] = useState(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let cancelled = false
    apiRequest('/api/progress', { token }).then(({ data }) => { if (!cancelled) setBoard(data) }).catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [token, version])
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { board, error, reload }
}

// Programa (el mas actual por defecto) y grupo elegidos.
function useGroupPicker(board) {
  const [programId, setProgramId] = useState(null)
  const [groupId, setGroupId] = useState(null)
  const programs = board?.programs || []
  const program = programs.find((p) => p.id === programId) || programs[0] || null
  const groups = useMemo(() => (board && program ? board.components.filter((c) => c.programId === program.id)
    .flatMap((c) => c.groups.map((g) => ({ ...g, component: c }))) : []), [board, program])
  // Por defecto el grupo con clase mas cercana (o el primero).
  const fallback = groups.find((g) => g.nextClass) || groups[0] || null
  const group = groups.find((g) => g.id === groupId) || fallback
  return { programs, program, setProgramId: (id) => { setProgramId(id); setGroupId(null) }, groups, group, setGroupId }
}

function Pickers({ programs, program, setProgramId, groups, group, setGroupId }) {
  return (
    <div className="in-pickers">
      {programs.length > 1 && (
        <label className="pf-select"><span>Programa</span>
          <select value={program?.id ?? ''} onChange={(e) => setProgramId(Number(e.target.value))}>
            {programs.map((p) => <option key={p.id} value={p.id}>{programOptionLabel(p)}</option>)}
          </select>
        </label>
      )}
      {groups.length > 0 && (
        <div className="in-groups" role="group" aria-label="Grupo">
          {groups.map((g) => (
            <button key={g.id} type="button" aria-pressed={g.id === group?.id} className={g.id === group?.id ? 'in-group on' : 'in-group'} style={{ '--pg-color': g.component.palette.primary }} onClick={() => setGroupId(g.id)}>
              <strong>{g.component.name}</strong><small>{g.name} · {g.enrolledStudents} alumno{g.enrolledStudents === 1 ? '' : 's'}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function StateChip({ topic }) {
  const s = STATE[topic.column] || { label: topic.statusLabel, tone: '' }
  return <span className={`st-state ${s.tone}`}>{s.label}</span>
}

function registerTopic(topic) {
  return { id: topic.id, title: topic.title, scheduled_on: topic.scheduledOn, status_code: topic.statusCode }
}

function RegisterModal({ session, topic, onClose }) {
  return (
    <Modal title={`Asistencia — ${topic.title}`} onClose={onClose} full>
      <InstructorAttendancePanel session={session} topic={registerTopic(topic)} onBack={onClose} embedded />
    </Modal>
  )
}

function Empty({ board, error }) {
  if (error) return <div className="admin-wrap"><ErrorNote message={error} /></div>
  if (!board) return <div className="admin-wrap"><p className="muted">Cargando…</p></div>
  return <div className="admin-wrap"><section className="panel"><p className="muted">Todavía no tienes grupos asignados. El administrador te asigna a un componente desde Programas.</p></section></div>
}

// ===================================================================
// Temarios: el temario del grupo con fecha, estado, asistencia,
// reacciones y material de cada tema.
export function InstructorSyllabusPanel({ session }) {
  const { token } = session
  const { board, error, reload } = useInstructorBoard(token)
  const picker = useGroupPicker(board)
  const { byTopic: reactions } = useReactionSummary(token)
  const [registering, setRegistering] = useState(null)
  const [material, setMaterial] = useState(null)
  const [classroom, setClassroom] = useState(null)
  const { group, program } = picker

  if (!board || !group) return <Empty board={board} error={error} />
  const c = group.counts
  return (
    <div className="admin-wrap in-wrap">
      <section className="panel">
        <div className="in-head">
          <div>
            <h3>Temarios</h3>
            <p className="muted">El temario de cada grupo con sus fechas y estado. Registra la asistencia o abre el material de cada tema.{program?.period ? ` Programa ${PERIOD_LABEL[program.period].toLowerCase()}.` : ''}</p>
          </div>
        </div>
        <Pickers {...picker} />
        <div className="in-summary" style={{ '--pg-color': group.component.palette.primary }}>
          <div className="in-progress">
            <strong>{group.progressPct}<small>%</small></strong>
            <ProgressBar value={group.progressPct} color={group.component.palette.primary} label={`Avance de ${group.component.name}`} />
            <small className="muted">{c.completed} de {group.total} temas dictados{c.delayed ? ` · ${c.delayed} atrasado${c.delayed === 1 ? '' : 's'}` : ''}</small>
          </div>
          {group.nextClass && <p className="pg-next"><CalendarClock size={16} aria-hidden="true" /> Próxima clase: <b>{classWhen(group.nextClass, board.today)}</b> — {group.nextClass.title}</p>}
        </div>
        <div className="table-scroll">
          <table className="admin-table in-table">
            <thead><tr><th>N°</th><th>Tema</th><th>Fecha</th><th>Estado</th><th>Asistencia</th><th>Opinión</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {group.topics.map((t) => (
                <tr key={t.id} className={t.column === 'completed' ? 'done' : ''}>
                  <td>{String(t.position).padStart(2, '0')}</td>
                  <td className="st-topic-title">{t.title}
                    <span className="in-class-flags">
                      {t.meetingUrl && <span title="Tiene link de la reunión"><Video size={12} aria-hidden="true" /> Link</span>}
                      {t.recordingUrl && <span title="Tiene grabación"><Clapperboard size={12} aria-hidden="true" /> Grabación</span>}
                      {t.resourceCount > 0 && <span title="Materiales"><FileText size={12} aria-hidden="true" /> {t.resourceCount}</span>}
                    </span>
                    {t.leaveCount > 0 && <small className="in-leave"><UserX size={12} aria-hidden="true" /> {t.leaveCount} avisó{t.leaveCount > 1 ? 'aron' : ''} inasistencia</small>}</td>
                  <td>{t.scheduledOn ? classWhen(t, board.today) : '—'}</td>
                  <td><StateChip topic={t} /></td>
                  <td>{t.attendance?.recorded ? `${t.attendance.present}/${t.attendance.recorded} (${percent(t.attendance.present, t.attendance.recorded)}%)` : <span className="muted">—</span>}</td>
                  <td><ReactionChip summary={reactions.get(t.id)} /></td>
                  <td className="row-actions">
                    <button type="button" className="btn-mini" onClick={() => setClassroom(t)}><Video size={13} aria-hidden="true" /> Clase</button>
                    {t.scheduledOn && t.scheduledOn <= board.today && <button type="button" className="btn-mini" onClick={() => setRegistering(t)}>{t.attendance?.recorded ? 'Ver asistencia' : 'Registrar'}</button>}
                    {t.hasMaterial && <button type="button" className="btn-mini" onClick={() => setMaterial(t)}><BookOpen size={13} aria-hidden="true" /> Material</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {registering && <RegisterModal session={session} topic={registering} onClose={() => { setRegistering(null); reload() }} />}
      {material && <MaterialViewer session={session} topic={material} onClose={() => setMaterial(null)} />}
      {classroom && (
        <Modal title={`Tema ${String(classroom.position).padStart(2, '0')} · ${classroom.title}`} onClose={() => { setClassroom(null); reload() }} wide>
          <ClassroomPanel session={session} topic={classroom} />
        </Modal>
      )}
    </div>
  )
}

// ===================================================================
// Asistencia: indicadores del grupo, clases por registrar, avisos de
// inasistencia proximos y la grilla de alumnos por sesion.
export function InstructorAttendanceOverview({ session }) {
  const { token } = session
  const { board, error, reload } = useInstructorBoard(token)
  const picker = useGroupPicker(board)
  const [registering, setRegistering] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const { group } = picker

  if (!board || !group) return <Empty board={board} error={error} />
  const today = board.today
  const pending = group.topics.filter((t) => t.scheduledOn && t.scheduledOn <= today && t.column && !t.attendance?.recorded)
  const notices = group.topics.filter((t) => t.scheduledOn && t.scheduledOn >= today && t.leaveCount > 0)
  const close = () => { setRegistering(null); setReloadKey((k) => k + 1); reload() }

  return (
    <div className="admin-wrap in-wrap">
      <section className="panel">
        <div className="in-head">
          <div>
            <h3>Asistencia</h3>
            <p className="muted">La asistencia de tus grupos: clases por registrar, avisos de tus alumnos y el récord de cada uno.</p>
          </div>
        </div>
        <Pickers {...picker} />
        <div className="in-cards">
          <section className="in-card">
            <h4><ClipboardCheck size={16} aria-hidden="true" /> Clases por registrar</h4>
            {!pending.length ? <p className="muted">Todas las clases dictadas tienen asistencia registrada.</p> : (
              <ul className="in-list">
                {pending.slice(0, 8).map((t) => (
                  <li key={t.id}>
                    <div><strong>{t.title}</strong><span className="muted">{classWhen(t, today)}</span></div>
                    <button type="button" className="primary btn-compact" onClick={() => setRegistering(t)}>Registrar</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="in-card">
            <h4><UserX size={16} aria-hidden="true" /> Avisos para próximas clases</h4>
            {!notices.length ? <p className="muted">Ningún alumno avisó que faltará a tus próximas clases.</p> : (
              <ul className="in-list">
                {notices.map((t) => (
                  <li key={t.id}>
                    <div><strong>{t.title}</strong><span className="muted">{classWhen(t, today)}</span></div>
                    <span className="pg-chip warn">{t.leaveCount} avisó{t.leaveCount > 1 ? 'aron' : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <h4 className="in-subtitle">Récord del grupo</h4>
        <AttendanceGrid session={session} group={group} reloadKey={reloadKey} onOpen={(t) => setRegistering(t)} />
      </section>
      {registering && <RegisterModal session={session} topic={registering} onClose={close} />}
    </div>
  )
}
