import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpenText, Compass, Search, X } from 'lucide-react'
import { apiRequest } from './api'

// Ayuda: guia paso a paso de primer uso (se muestra una sola vez por
// usuario; queda registrado en la base) y el manual detallado de cada rol.

export const START_GUIDE_EVENT = 'start-guide'

// ===================================================================
// Guia de primer uso: cada paso abre una seccion del menu y la resalta.
const GUIDES = {
  student: [
    { title: '¡Bienvenido a tu espacio de entrenamiento!', text: 'Te mostramos en un minuto dónde está cada cosa. Puedes saltar la guía y volver a verla cuando quieras desde Ayuda.' },
    { nav: 'Mi horario', title: 'Mi horario', text: 'Tu calendario de esta semana, del mes o de todo el programa. Abre por defecto en tus clases más cercanas. Toca una clase para ver el detalle.' },
    { nav: 'Mis temas', title: 'Mis temas', text: 'Los programas, componentes y temas en los que estás, con lo que el profesor ya dictó y tu avance. Aquí calificas cada clase y dejas comentarios.' },
    { nav: 'Asistencia', title: 'Asistencia', text: 'Tu récord por componente y tus inasistencias. Si no podrás ir a una clase, avísalo aquí: le llega a tu profesor y puedes adjuntar una imagen de evidencia.' },
    { nav: 'Mi perfil', title: 'Mi perfil', text: 'Deja tu GitHub, LinkedIn y datos de contacto, y sube tu foto. Tus profesores los ven; tu teléfono solo lo ve el administrador.' },
    { nav: 'Soporte', title: '¿Algo no funciona?', text: 'Usa “Reportar” arriba desde la pantalla donde está el problema: se adjunta una captura automáticamente. Sigue las respuestas en Soporte.' },
    { nav: 'Ayuda', title: 'Ayuda', text: 'Aquí está el manual completo de tu rol, por si tienes dudas. ¡Listo, a aprender!' },
  ],
  instructor: [
    { title: '¡Bienvenido, profesor!', text: 'Un recorrido rápido por tus herramientas. Puedes saltarlo y verlo de nuevo desde Ayuda.' },
    { nav: 'Avance', title: 'Avance', text: 'El tablero de tus componentes y temas. Abre un tema para registrar asistencia, ver las reacciones de los alumnos o avisar que no podrás dictar una clase.' },
    { nav: 'Mis clases', title: 'Mis clases', text: 'Tu calendario semanal y tus grupos: temario, material y registro de asistencia de cada sesión.' },
    { nav: 'Mis alumnos', title: 'Mis alumnos', text: 'Los perfiles de tus alumnos con sus links (GitHub, LinkedIn) y correo para conectar con el talento.' },
    { nav: 'Mi disponibilidad', title: 'Mi disponibilidad', text: 'Indica los días y horas en que puedes dictar. El administrador genera los horarios a partir de aquí.' },
    { nav: 'Permisos', title: 'Avisos de inasistencia', text: 'Los avisos de tus alumnos para tus clases y tus propios avisos de inasistencia.' },
    { nav: 'Ayuda', title: 'Ayuda', text: 'El manual completo del profesor. Para reportar un problema usa “Reportar” en la barra superior.' },
  ],
  admin: [
    { title: '¡Bienvenido, administrador!', text: 'Te mostramos el flujo para poner en marcha un programa. Puedes saltarlo y verlo luego desde Ayuda.' },
    { nav: 'Programas', title: '1. Programas', text: 'Crea el programa, sus componentes (cursos) y los grupos de cada uno con su profesor. Carga los temas a mano o por Excel.' },
    { nav: 'Usuarios', title: '2. Usuarios', text: 'Invita a profesores y alumnos: cada uno recibe un enlace para crear su contraseña. Aquí también atiendes las solicitudes de “Olvidé mi clave”.' },
    { nav: 'Calendario', title: '3. Feriados', text: 'Carga los feriados de Perú del año con un botón. Las clases nunca se programan en feriado.' },
    { nav: 'Horarios', title: '4. Horarios automáticos', text: 'Con la disponibilidad de cada profesor, genera los días y horas de cada grupo y las fechas de todos los temas en un clic.' },
    { nav: 'Avance', title: '5. Seguimiento', text: 'El avance de cada componente y tema, con asistencia. Inasistencias y Satisfacción tienen los indicadores de alumnos y profesores.' },
    { nav: 'Soporte', title: 'Soporte', text: 'Las incidencias, observaciones y mejoras que reportan los usuarios, con la captura de su pantalla. Respóndelas desde aquí.' },
    { nav: 'Ayuda', title: 'Ayuda', text: 'El manual detallado de cada rol. ¡Éxitos con tu programa!' },
  ],
  superAdmin: [
    { title: '¡Bienvenido, super administrador!', text: 'Controlas todos los tenants. Un recorrido rápido; puedes verlo de nuevo desde Ayuda.' },
    { nav: 'Tenants', title: 'Tenants', text: 'Crea organizaciones, su logo, color y enlace de acceso propio, y sus administradores.' },
    { nav: 'Usuarios', title: 'Usuarios', text: 'Todos los usuarios con su tenant. Atiende aquí las solicitudes de recuperación de clave de los administradores.' },
    { nav: 'Horarios', title: 'Horarios', text: 'Genera horarios y fechas de cualquier programa según la disponibilidad de los profesores.' },
    { nav: 'Soporte', title: 'Soporte', text: 'Los reportes de todos los tenants, con captura de pantalla. Responde y cambia su estado.' },
    { nav: 'Ayuda', title: 'Ayuda', text: 'Los manuales de todos los roles están aquí.' },
  ],
}

function useNavRect(nav) {
  const [rect, setRect] = useState(null)
  useLayoutEffect(() => {
    if (!nav) { setRect(null); return undefined }
    const find = () => {
      const el = document.querySelector(`[data-nav="${CSS.escape(nav)}"]`)
      const r = el?.getBoundingClientRect()
      setRect(r && r.width > 0 && window.innerWidth > 900 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null)
    }
    find()
    const t = setTimeout(find, 120)
    window.addEventListener('resize', find)
    return () => { clearTimeout(t); window.removeEventListener('resize', find) }
  }, [nav])
  return rect
}

export function GuideTour({ role, onNavigate, onClose }) {
  const steps = GUIDES[role] || GUIDES.student
  const [index, setIndex] = useState(0)
  const step = steps[index]
  const rect = useNavRect(step.nav)
  useEffect(() => { if (step.nav) onNavigate(step.nav) }, [step.nav, onNavigate])
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && index < steps.length - 1) setIndex(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, steps.length, onClose])

  const last = index === steps.length - 1
  const cardStyle = rect ? { top: Math.min(Math.max(rect.top - 20, 16), window.innerHeight - 280), left: rect.left + rect.width + 18 } : undefined
  return (
    <div className={rect ? "gd-overlay spotlit" : "gd-overlay"} role="dialog" aria-modal="true" aria-labelledby="gd-title" data-no-capture>
      {rect && <div className="gd-spot" style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }} />}
      <div className={rect ? 'gd-card anchored' : 'gd-card'} style={cardStyle}>
        <div className="gd-top">
          <span className="gd-kicker"><Compass size={13} aria-hidden="true" /> Guía · {index + 1} de {steps.length}</span>
          <button type="button" className="gd-close" onClick={onClose} aria-label="Cerrar guía"><X size={16} aria-hidden="true" /></button>
        </div>
        <h3 id="gd-title">{step.title}</h3>
        <p>{step.text}</p>
        <div className="gd-dots" aria-hidden="true">{steps.map((_, i) => <span key={i} className={i === index ? 'on' : ''} />)}</div>
        <div className="gd-actions">
          <button type="button" className="text-button" onClick={onClose}>Saltar guía</button>
          <div>
            {index > 0 && <button type="button" className="btn-mini" onClick={() => setIndex(index - 1)}><ArrowLeft size={13} aria-hidden="true" /> Anterior</button>}
            <button type="button" className="primary gd-next" onClick={() => (last ? onClose() : setIndex(index + 1))} autoFocus>{last ? 'Empezar' : <>Siguiente <ArrowRight size={14} aria-hidden="true" /></>}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Muestra la guia la primera vez; "Ver la guia" (Ayuda) la vuelve a abrir.
export function useFirstUseGuide(session) {
  const [open, setOpen] = useState(false)
  const token = session?.token
  useEffect(() => {
    if (!token) return undefined
    let cancelled = false
    apiRequest('/api/me/onboarding', { token }).then(({ data }) => { if (!cancelled && !data.done) setOpen(true) }).catch(() => {})
    const start = () => setOpen(true)
    window.addEventListener(START_GUIDE_EVENT, start)
    return () => { cancelled = true; window.removeEventListener(START_GUIDE_EVENT, start) }
  }, [token])
  function close() {
    setOpen(false)
    if (token) apiRequest('/api/me/onboarding', { method: 'POST', token, body: { done: true } }).catch(() => {})
  }
  return { open, close }
}

// ===================================================================
// Manual por rol. Cada seccion: para que sirve, pasos y consejos.
const MANUALS = {
  student: {
    label: 'Alumno (talento)',
    intro: 'Todo lo que necesitas para seguir tu programa: horario, temas, asistencia, avisos y tu perfil profesional.',
    sections: [
      { id: 'acceso', title: 'Ingresar y recuperar tu contraseña', nav: null, body: 'Ingresas con tu correo y la contraseña que creaste con tu enlace de invitación.', steps: ['Abre el enlace de acceso de tu organización y escribe tu correo y contraseña.', 'Si olvidaste tu contraseña, toca “¿Olvidaste tu contraseña?”, escribe tu correo y envía la solicitud.', 'Tu administrador te enviará un enlace personal de un solo uso para crear una nueva.', 'Para cambiarla cuando quieras: Mi cuenta → Cambiar mi contraseña.'], tips: ['El enlace de invitación vence a los 7 días: si venció, pide uno nuevo a tu administrador.'] },
      { id: 'horario', title: 'Mi horario', nav: 'Mi horario', body: 'Tu calendario de clases en tres vistas.', steps: ['Arriba ves tus próximas 3 clases.', 'Cambia entre Semana, Mes y Todo el programa.', 'Usa ← Hoy → para moverte y “Próxima clase” para volver a lo más cercano.', 'Toca una clase para ver su detalle, abrir el contenido, calificarla o avisar que no asistirás.'], tips: ['Si estás en varios programas, elige el programa arriba: por defecto se abre el más actual.'] },
      { id: 'temas', title: 'Mis temas, calificar clases y comentar', nav: 'Mis temas', body: 'Tus programas, componentes y temas con el avance real.', steps: ['Cada componente muestra su avance, cuántos temas dictó el profesor y tu asistencia.', 'En “Tu opinión” toca Calificar para elegir de 😞 a 🤩 y, si quieres, “Quiero que se repita”.', 'En el detalle de una clase toca “Dejar un comentario” y elige si es sobre el tema, el curso o el profesor (máx. 500 caracteres).', 'Al final de cada componente puedes comentar sobre el curso o el profesor.'], tips: ['Solo se pueden calificar las clases ya dictadas.', 'Tus comentarios los lee el administrador, con tu nombre. Máximo 10 por día.'] },
      { id: 'asistencia', title: 'Asistencia y avisos de inasistencia', nav: 'Asistencia', body: 'Tu récord y tus avisos.', steps: ['Revisa tu % de asistencia, inasistencias y avisos.', 'Para avisar que no irás: en “Próximas clases” toca “Avisar que no asistiré”, escribe el motivo y adjunta una foto o captura si tienes (certificado, por ejemplo).', 'El aviso le llega a tu profesor como alerta y el administrador lo puede aprobar.', 'Si cambias de planes, abre la clase y toca “Retirar aviso” (solo si está pendiente).'], tips: ['Avisar antes de la clase cuenta a tu favor en los indicadores: no es lo mismo que faltar y justificar después.', 'La imagen de evidencia es privada: solo la ven tú, tus profesores y el administrador.'] },
      { id: 'perfil', title: 'Mi perfil profesional', nav: 'Mi perfil', body: 'Tu carta de presentación ante profesores y la organización.', steps: ['Sube una foto o una imagen que te identifique.', 'Completa titular, GitHub, LinkedIn, portafolio, ciudad, correo de contacto y “Sobre ti”.', 'Revisa a la derecha cómo te ven tus profesores y guarda.'], tips: ['Tu teléfono solo lo ve el administrador.'] },
      { id: 'permisos', title: 'Permisos por fechas', nav: 'Permisos', body: 'Para ausencias de varios días.', steps: ['En Permisos indica desde, hasta, tipo, motivo e imagen opcional.', 'El administrador lo aprueba o rechaza y ves el estado aquí.'], tips: [] },
      { id: 'soporte', title: 'Reportar un problema o una idea', nav: 'Soporte', body: 'Incidencias, observaciones y mejoras.', steps: ['Ve a la pantalla donde está el problema y toca “Reportar” en la barra superior.', 'Elige el tipo, escribe título y detalle. La captura de la pantalla se adjunta sola y puedes agregar otra imagen.', 'Sigue las respuestas en Soporte; también te llegan como alerta.'], tips: [] },
    ],
  },
  instructor: {
    label: 'Profesor',
    intro: 'Dictar, registrar asistencia, conocer a tus alumnos y gestionar tu disponibilidad.',
    sections: [
      { id: 'acceso', title: 'Ingresar y recuperar tu contraseña', nav: null, body: 'Igual que todos los usuarios.', steps: ['Ingresa con tu correo y contraseña.', 'Si la olvidaste: “¿Olvidaste tu contraseña?” en el login; tu administrador te enviará un enlace de un solo uso.'], tips: [] },
      { id: 'avance', title: 'Avance: tablero de temas', nav: 'Avance', body: 'Tus componentes y temas por estado: pendiente, programado, en curso, atrasado y completado.', steps: ['Abre un componente para ver su tablero de temas, el temario y la grilla de asistencia.', 'Abre un tema para registrar asistencia, abrir el material y ver cuántos alumnos reaccionaron y cuántos piden repetirlo.', 'En los temas próximos puedes “Avisar que no podré dictar esta clase”.'], tips: ['Las reacciones se muestran en cantidades, sin nombres de alumnos.'] },
      { id: 'clases', title: 'Mis clases y registro de asistencia', nav: 'Mis clases', body: 'Calendario semanal y grupos.', steps: ['Elige una clase del calendario o un grupo → Ver temario.', 'Al registrar asistencia todos empiezan como Presente: marca solo ausentes, tardanzas o retiros y guarda.', 'Verás si un alumno avisó que no asistiría.'], tips: [] },
      { id: 'alumnos', title: 'Mis alumnos', nav: 'Mis alumnos', body: 'Perfiles de los alumnos de tus grupos.', steps: ['Busca por nombre, ciudad o titular y filtra por componente.', 'Abre “Ver perfil” para ver su descripción y sus links.'], tips: ['No verás teléfonos: ese dato solo lo ve el administrador.'] },
      { id: 'disponibilidad', title: 'Mi disponibilidad', nav: 'Mi disponibilidad', body: 'Base para generar los horarios automáticamente.', steps: ['Usa “Agregar rápido” (Mañanas, Tardes, Noches, Sábados) o agrega franjas por día.', 'Ajusta horas, quita franjas y guarda.'], tips: ['Si no registras disponibilidad, el generador no podrá asignarte grupos.'] },
      { id: 'avisos', title: 'Avisos de inasistencia', nav: 'Permisos', body: 'Los avisos de tus alumnos y los tuyos.', steps: ['Revisa los avisos de tus alumnos para tus clases (el administrador los aprueba).', 'Tus propios avisos aparecen en “Mis avisos de inasistencia”; puedes retirarlos si la clase no pasó.'], tips: ['Avisar con anticipación mejora tu indicador de puntualidad del aviso.'] },
      { id: 'soporte', title: 'Reportar un problema', nav: 'Soporte', body: 'Usa “Reportar” en la barra superior desde la pantalla con el problema: la captura se adjunta sola.', steps: [], tips: [] },
    ],
  },
  admin: {
    label: 'Administrador de tenant',
    intro: 'Configurar programas, usuarios, calendario y horarios, y hacer seguimiento con indicadores.',
    sections: [
      { id: 'programas', title: 'Programas, componentes, grupos y temas', nav: 'Programas', body: 'La estructura de cada programa.', steps: ['Crea el programa (nombre, cohorte, fechas, colores).', 'Ver componentes → crea cada componente (curso) en orden.', 'Ver grupos → crea los grupos y asigna el profesor de cada uno.', 'Ver temario → carga los temas a mano o con la plantilla de Excel.', 'Si cambias el profesor de un grupo, indica el motivo (renuncia, reasignación…): queda en el historial.'], tips: ['Un profesor no puede tener dos grupos en el mismo horario.'] },
      { id: 'usuarios', title: 'Usuarios e invitaciones', nav: 'Usuarios', body: 'Profesores y alumnos se crean sin contraseña.', steps: ['Crea el usuario: se genera un enlace de invitación para que cree su contraseña. Cópialo y compártelo.', 'Carga masiva por Excel para muchos usuarios a la vez.', 'Inscribe a los alumnos en los grupos desde Programas → grupos.'], tips: [] },
      { id: 'clave', title: 'Solicitudes de recuperación de clave', nav: 'Usuarios', body: 'Cuando alguien toca “¿Olvidaste tu contraseña?”, la solicitud aparece arriba en Usuarios y como alerta.', steps: ['Toca “Generar enlace”: se crea un enlace de un solo uso.', 'Cópialo y compártelo por un canal confiable.', 'Si la solicitud no es legítima, “Descartar”.'], tips: ['Por seguridad, el login nunca dice si un correo existe.'] },
      { id: 'feriados', title: 'Feriados de Perú', nav: 'Calendario', body: 'Las clases nunca se programan en feriado.', steps: ['Elige el año y toca “Recargar feriados”.', 'Se agregan los feriados nacionales (incluye Jueves y Viernes Santo de ese año); los existentes no se duplican.', 'Agrega a mano los días no laborables que decrete el gobierno.'], tips: ['Carga los feriados de cada año que dure el programa antes de generar horarios.'] },
      { id: 'horarios', title: 'Generar horarios automáticamente', nav: 'Horarios', body: 'Días, hora y fechas de todos los temas en un clic.', steps: ['Elige el programa (se abre el actual).', 'Paso 1: revisa que cada profesor tenga disponibilidad (puedes registrarla tú).', 'Paso 2: fecha de inicio, clases por semana, duración y si los componentes van uno tras otro o a la vez.', 'Paso 3: “Ver vista previa” muestra días, hora y fechas de cada grupo y avisa si faltan feriados.', '“Generar horarios y fechas” guarda el horario y fecha a cada tema pendiente o programado.'], tips: ['Los temas ya dictados no se tocan.', 'Puedes volver a generar cuando cambie la disponibilidad.'] },
      { id: 'seguimiento', title: 'Avance, asistencia y permisos', nav: 'Avance', body: 'Seguimiento diario.', steps: ['Avance: tablero por componente y tema con asistencia.', 'Permisos: aprueba o rechaza permisos y avisos de inasistencia (con su imagen de evidencia).', 'Alumnos: perfiles con datos de contacto, incluido el teléfono.'], tips: [] },
      { id: 'inasistencias', title: 'Inasistencias e indicadores', nav: 'Inasistencias', body: 'Alumnos, profesores y cambios de profesor.', steps: ['Alumnos: faltas por persona según si avisaron con anticipación, el mismo día, justificaron después o no justificaron; historial de cada uno.', 'Profesores: registra faltas (aunque no hayan avisado), márcalas justificadas o no, y revisa la puntualidad del aviso.', 'Cambios de profesor: historial con motivos, incluidas renuncias.'], tips: [] },
      { id: 'satisfaccion', title: 'Satisfacción y reporte con IA', nav: 'Satisfacción', body: 'Lo que opinan los alumnos.', steps: ['Resumen por programa, curso y profesor; temas mejor valorados y a revisar.', 'Pedidos de repetir: para planificar a futuro.', 'Comentarios: búscalos y fíltralos por tipo.', 'Reporte con IA: elige el alcance y genera un análisis con fortalezas, problemas y recomendaciones. Queda guardado.'], tips: ['A la IA no se le envían nombres de alumnos.'] },
      { id: 'soporte', title: 'Soporte', nav: 'Soporte', body: 'Incidencias, observaciones y mejoras de los usuarios.', steps: ['Abre un reporte para ver la captura de la pantalla de origen, la imagen y los datos del navegador.', 'Responde: le llega como alerta a quien reportó.', 'Cambia el estado: abierto, en atención, resuelto o cerrado.'], tips: [] },
    ],
  },
  superAdmin: {
    label: 'Super administrador',
    intro: 'Gestión global: tenants, administradores y soporte de toda la plataforma.',
    sections: [
      { id: 'tenants', title: 'Tenants', nav: 'Tenants', body: 'Cada organización es un tenant.', steps: ['Crea el tenant con su nombre, slug y contacto.', 'Configura logo y color de marca.', 'Comparte su enlace de acceso propio (/t/slug).', 'Desde el tenant puedes ir a sus usuarios.'], tips: [] },
      { id: 'usuarios', title: 'Usuarios y administradores', nav: 'Usuarios', body: 'Todos los usuarios de la plataforma.', steps: ['Crea administradores de tenant e invítalos.', 'Filtra por tenant y rol.', 'Atiende las solicitudes de recuperación de clave de los administradores.'], tips: [] },
      { id: 'operacion', title: 'Operación de cualquier tenant', nav: 'Programas', body: 'Tienes las mismas herramientas que un administrador, sobre todos los tenants.', steps: ['Programas, Calendario (eligiendo el tenant), Horarios, Inasistencias y Satisfacción funcionan igual que para el administrador.'], tips: ['Consulta también el manual del administrador.'] },
      { id: 'soporte', title: 'Soporte global', nav: 'Soporte', body: 'Los reportes de todos los tenants llegan aquí y como alerta.', steps: ['Prioriza las incidencias (llegan con prioridad alta).', 'Responde y cambia el estado.'], tips: [] },
    ],
  },
}
const VISIBLE_MANUALS = { student: ['student'], instructor: ['instructor'], admin: ['admin', 'instructor', 'student'], superAdmin: ['superAdmin', 'admin', 'instructor', 'student'] }

export function HelpPanel({ session, navigate }) {
  const role = session.role
  const available = VISIBLE_MANUALS[role] || ['student']
  const [manualKey, setManualKey] = useState(available[0])
  const [query, setQuery] = useState('')
  const manual = MANUALS[manualKey]
  const q = query.trim().toLowerCase()
  const sections = useMemo(() => manual.sections.filter((s) => !q || [s.title, s.body, ...s.steps, ...s.tips].some((t) => t.toLowerCase().includes(q))), [manual, q])

  return (
    <div className="admin-wrap">
      <section className="panel help-panel">
        <div className="help-head">
          <div>
            <p className="kicker">Manual de uso</p>
            <h3><BookOpenText size={18} aria-hidden="true" /> {manual.label}</h3>
            <p className="muted">{manual.intro}</p>
          </div>
          <button type="button" className="primary help-guide" onClick={() => window.dispatchEvent(new Event(START_GUIDE_EVENT))}><Compass size={16} aria-hidden="true" /> Ver la guía paso a paso</button>
        </div>
        {available.length > 1 && (
          <div className="material-tabs help-roles" role="group" aria-label="Manual de">
            {available.map((k) => <button key={k} type="button" className={k === manualKey ? 'tab-button active' : 'tab-button'} aria-pressed={k === manualKey} onClick={() => setManualKey(k)}>{MANUALS[k].label}</button>)}
          </div>
        )}
        <label className="pf-search help-search"><Search size={15} aria-hidden="true" /><span className="sr-only">Buscar en el manual</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en el manual (p. ej. contraseña, feriados, asistencia)…" />
        </label>
        <div className="help-layout">
          <nav className="help-toc" aria-label="Contenido">
            <ol>{sections.map((s) => <li key={s.id}><a href={`#help-${manualKey}-${s.id}`}>{s.title}</a></li>)}</ol>
          </nav>
          <div className="help-sections">
            {!sections.length && <p className="muted">No encontramos nada con “{query}”. Prueba otra palabra o reporta tu duda en Soporte.</p>}
            {sections.map((s, i) => (
              <article key={s.id} id={`help-${manualKey}-${s.id}`} className="help-section">
                <h4><span className="sch-step-n">{i + 1}</span> {s.title}</h4>
                <p>{s.body}</p>
                {s.steps.length > 0 && <ol className="help-steps">{s.steps.map((t) => <li key={t}>{t}</li>)}</ol>}
                {s.tips.length > 0 && <ul className="help-tips">{s.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
                {s.nav && manualKey === available[0] && navigate && <button type="button" className="btn-mini" onClick={() => navigate(s.nav)}>Ir a {s.nav} →</button>}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
