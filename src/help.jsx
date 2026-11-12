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
    { nav: 'Mi disponibilidad', title: 'Mi disponibilidad', text: 'Para cada programa donde dictas, indica los días y horas en que puedes. El administrador genera el horario con esto; al cerrarlo ya no cambia.' },
    { nav: 'Permisos', title: 'Avisos de inasistencia', text: 'Los avisos de tus alumnos para tus clases y tus propios avisos de inasistencia.' },
    { nav: 'Cursos', title: 'Cursos', text: 'Inscríbete como alumno en otros cursos sin cruzar tus clases, y cúrsalos con “Modo alumno” (arriba).' },
    { nav: 'Ayuda', title: 'Ayuda', text: 'El manual completo del profesor. Para reportar un problema usa “Reportar” en la barra superior.' },
  ],
  admin: [
    { title: '¡Bienvenido, administrador!', text: 'Te mostramos el flujo para poner en marcha un programa. Puedes saltarlo y verlo luego desde Ayuda.' },
    { nav: 'Programas', title: '1. Programas', text: 'Crea el programa, sus componentes (cursos) y los grupos de cada uno con su profesor. Carga los temas a mano o por Excel.' },
    { nav: 'Usuarios', title: '2. Usuarios', text: 'Invita a profesores y alumnos: cada uno recibe un enlace para crear su contraseña. Aquí también atiendes las solicitudes de “Olvidé mi clave”.' },
    { nav: 'Calendario', title: '3. Feriados', text: 'Carga los feriados de Perú del año con un botón. Las clases nunca se programan en feriado.' },
    { nav: 'Horarios', title: '4. Horarios automáticos', text: 'Por programa: asigna quién dicta cada curso, registra la disponibilidad y genera días, horas y fechas sin cruces ni feriados. Luego cierra el horario.' },
    { nav: 'Avance', title: '5. Seguimiento', text: 'El avance de cada componente y tema, con asistencia. Inasistencias y Satisfacción tienen los indicadores de alumnos y profesores.' },
    { nav: 'Cursos', title: 'Cursos', text: 'Inscríbete como alumno en otros cursos sin cruzar tus clases, y cúrsalos con “Modo alumno” (arriba).' },
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

// Elemento que resalta un paso: un item del menu (nav) o una parte de la
// pantalla (selector CSS; si hay varios separados por coma, el primero que
// exista). Sin elemento visible, la tarjeta va centrada.
function useTargetRect(step) {
  const [rect, setRect] = useState(null)
  const key = step.nav ? `nav:${step.nav}` : step.selector ? `sel:${step.selector}` : ''
  useLayoutEffect(() => {
    if (!key) { setRect(null); return undefined }
    let scrolled = false
    const find = () => {
      const el = step.nav ? document.querySelector(`[data-nav="${CSS.escape(step.nav)}"]`) : document.querySelector(step.selector)
      if (!el) { setRect(null); return }
      if (step.selector && !scrolled) { scrolled = true; el.scrollIntoView({ block: 'center', behavior: 'instant' }) }
      const r = el.getBoundingClientRect()
      const visible = r.width > 0 && r.height > 0 && (!step.nav || window.innerWidth > 900)
      setRect(visible ? { top: r.top, left: r.left, width: r.width, height: Math.min(r.height, window.innerHeight - 40), isNav: Boolean(step.nav) } : null)
    }
    find()
    // La pantalla puede estar cargando datos: se reintenta un momento.
    const timers = [150, 450, 900].map((ms) => setTimeout(find, ms))
    window.addEventListener('resize', find)
    return () => { timers.forEach(clearTimeout); window.removeEventListener('resize', find) }
  }, [key])
  return rect
}

const CARD_W = 400
function cardPosition(rect) {
  if (!rect) return undefined
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (vw < 640) return { left: 16, right: 16, width: 'auto', ...(rect.top + rect.height / 2 > vh / 2 ? { top: 16, bottom: 'auto' } : { bottom: 16, top: 'auto' }) }
  if (rect.isNav) return { top: Math.min(Math.max(rect.top - 20, 16), vh - 300), left: rect.left + rect.width + 18 }
  const left = Math.min(Math.max(rect.left, 16), vw - CARD_W - 16)
  const below = rect.top + rect.height + 14
  if (below + 260 < vh) return { top: below, left }
  if (rect.top - 274 > 0) return { top: rect.top - 274, left }
  return { top: Math.max(16, vh - 290), left: Math.max(16, vw - CARD_W - 24) }
}

export function GuideTour({ role, steps: customSteps, onNavigate, onClose }) {
  const steps = customSteps || GUIDES[role] || GUIDES.student
  const [index, setIndex] = useState(0)
  const step = steps[index]
  const rect = useTargetRect(step)
  useEffect(() => { if (step.nav && onNavigate) onNavigate(step.nav) }, [step.nav, onNavigate])
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
  return (
    <div className={rect ? 'gd-overlay spotlit' : 'gd-overlay'} role="dialog" aria-modal="true" aria-labelledby="gd-title" data-no-capture>
      {rect && <div className="gd-spot" style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }} />}
      <div className={rect ? 'gd-card anchored' : 'gd-card'} style={cardPosition(rect)}>
        <div className="gd-top">
          <span className="gd-kicker"><Compass size={13} aria-hidden="true" /> {customSteps ? 'Guía de esta pantalla' : 'Guía'} · {index + 1} de {steps.length}</span>
          <button type="button" className="gd-close" onClick={onClose} aria-label="Cerrar guía"><X size={16} aria-hidden="true" /></button>
        </div>
        <h3 id="gd-title">{step.title}</h3>
        <p>{step.text}</p>
        <div className="gd-dots" aria-hidden="true">{steps.map((_, i) => <span key={i} className={i === index ? 'on' : ''} />)}</div>
        <div className="gd-actions">
          <button type="button" className="text-button" onClick={onClose}>{customSteps ? 'Cerrar' : 'Saltar guía'}</button>
          <div>
            {index > 0 && <button type="button" className="btn-mini" onClick={() => setIndex(index - 1)}><ArrowLeft size={13} aria-hidden="true" /> Anterior</button>}
            <button type="button" className="primary gd-next" onClick={() => (last ? onClose() : setIndex(index + 1))} autoFocus>{last ? (customSteps ? 'Entendido' : 'Empezar') : <>Siguiente <ArrowRight size={14} aria-hidden="true" /></>}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===================================================================
// Guia paso a paso de cada pantalla (boton "Guía" de la barra superior).
// Cada paso resalta una parte de la pantalla por su selector.
const PANEL = '.content .panel, .content .admin-wrap > *'
const SCREEN_GUIDES = {
  Inicio: {
    default: [
      { selector: '.cl-nextbar', title: 'Tu próxima clase', text: 'Siempre arriba, en todas las pantallas: cuándo es tu próxima clase y el botón para unirte a la reunión de Teams, Meet o Zoom.' },
      { selector: '.content .metrics, .content .panel', title: 'Tu resumen', text: 'Aquí ves de un vistazo lo más importante de tu día: indicadores y próximas clases.' },
      { selector: '.content .action-row, .content .next-class-banner, .content .panel + .panel', title: 'Atajos', text: 'Usa estos accesos para ir directo a lo que más haces. Todo lo demás está en el menú de la izquierda.' },
      { selector: '.sp-report-btn', title: 'Reportar y guía', text: '“Reportar” envía una incidencia o mejora con captura de la pantalla. “Guía” abre esta ayuda en cualquier pantalla.' },
    ],
  },
  Avance: {
    default: [
      { selector: '.pg-title', title: 'Programa', text: 'Si tienes varios programas, elige aquí cuál ver: se abre el más actual.' },
      { selector: '.pg-board, .pg-summary, ' + PANEL, title: 'Tablero', text: 'Cada componente está en la columna de su estado: pendiente, programado, en curso, atrasado o completado. Toca una tarjeta para entrar.' },
      { selector: '.pg-card', title: 'Detalle', text: 'Dentro de un componente verás sus temas, el temario y la asistencia. Abre un tema para ver o registrar lo que necesites.' },
    ],
  },
  'Mi horario': {
    default: [
      { selector: '.st-next, .st-next-card', title: 'Próximas clases', text: 'Tus 3 clases más cercanas, con fecha y hora.' },
      { selector: '.st-calendar [role=tablist], .st-calendar', title: 'Vistas', text: 'Cambia entre Semana, Mes y Todo el programa. Usa ← Hoy → para moverte.' },
      { selector: '.st-event, .st-calendar', title: 'Una clase', text: 'Toca una clase para ver el detalle, abrir el contenido, calificarla o avisar que no asistirás.' },
    ],
  },
  'Mis temas': {
    default: [
      { selector: '.st-program-pct', title: 'Avance del programa', text: 'El % de clases ya dictadas en todo el programa.' },
      { selector: '.st-comp', title: 'Componentes', text: 'Toca un componente para ver sus temas, tu asistencia y tu opinión.' },
      { selector: '.st-topics', title: 'Calificar', text: 'En “Tu opinión” toca Calificar: elige de 😞 a 🤩 y marca si quieres que se repita.' },
      { selector: '.st-comp-foot', title: 'Comentar', text: 'Deja un comentario breve sobre el curso o el profesor (lo lee el administrador).' },
    ],
  },
  Asistencia: {
    student: [
      { selector: '.st-att-summary', title: 'Tu récord', text: 'Tu % de asistencia, inasistencias, tardanzas y avisos.' },
      { selector: '.st-upcoming', title: 'Avisar una inasistencia', text: 'Si no podrás ir, toca “Avisar que no asistiré”, escribe el motivo y adjunta una imagen si tienes. Le llega a tu profesor.' },
      { selector: '.st-record', title: 'Por componente', text: 'Tu asistencia en cada componente del programa.' },
    ],
    default: [
      { selector: '.in-groups', title: 'Elige el grupo', text: 'Cambia entre tus grupos (y de programa si tienes varios).' },
      { selector: '.in-cards .in-card', title: 'Clases por registrar', text: 'Las clases ya dictadas sin asistencia. Toca Registrar: todos empiezan como Presente y marcas solo ausentes, tardanzas o retiros.' },
      { selector: '.in-cards .in-card + .in-card', title: 'Avisos de tus alumnos', text: 'Quiénes avisaron que faltarán a tus próximas clases.' },
      { selector: '.pg-att-view', title: 'Récord del grupo', text: 'La asistencia de cada alumno por sesión y su porcentaje. Toca una sesión para abrir su registro.' },
    ],
  },
  'Mis clases': {
    default: [
      { selector: '.week-nav, .week-grid', title: 'Calendario semanal', text: 'Tus clases de la semana. Toca una para registrar asistencia.' },
      { selector: '.admin-table', title: 'Mis grupos', text: 'Abre el temario o el material de cada grupo.' },
    ],
  },
  Temarios: {
    default: [
      { selector: '.in-groups', title: 'Elige el grupo', text: 'Cada tarjeta es uno de tus grupos con su componente y cantidad de alumnos.' },
      { selector: '.in-summary', title: 'Avance', text: 'Cuántos temas dictaste, cuántos están atrasados y tu próxima clase.' },
      { selector: '.in-table', title: 'Temario', text: 'Cada tema con su fecha, estado, asistencia y la opinión de los alumnos. Desde aquí registras asistencia o abres el material.' },
      { selector: '.in-table .row-actions .btn-mini', title: 'La clase en línea', text: '“Clase” abre el link de la reunión (puedes dejar uno para todas las clases del grupo), la grabación, una nota y los archivos para tus alumnos.' },
    ],
  },
  Permisos: {
    student: [
      { selector: '.admin-form-panel', title: 'Permiso por fechas', text: 'Para ausencias de varios días: fechas, tipo, motivo e imagen opcional.' },
      { selector: '.admin-table', title: 'Tus solicitudes', text: 'Aquí ves si tu permiso fue aprobado o rechazado. Para una sola clase, avísalo desde Asistencia.' },
    ],
    instructor: [
      { selector: '.content .panel', title: 'Tus avisos', text: 'Tus propios avisos de inasistencia. Para avisar, abre la clase desde Avance.' },
      { selector: '.admin-table', title: 'Avisos de tus alumnos', text: 'Los avisos de tus alumnos para tus clases, con su evidencia.' },
    ],
    default: [{ selector: '.admin-table, ' + PANEL, title: 'Solicitudes', text: 'Aprueba o rechaza permisos y avisos de inasistencia. “Ver evidencia” abre la imagen adjunta.' }],
  },
  Alertas: { default: [{ selector: PANEL, title: 'Alertas', text: 'Avisos del sistema para ti: inasistencias, solicitudes, reportes y respuestas. Márcalas como leídas al atenderlas. La campana de arriba tiene un punto rojo cuando hay nuevas.' }] },
  'Mi perfil': {
    default: [
      { selector: '.pf-photo-panel', title: 'Tu foto', text: 'Sube una foto o una imagen que te identifique.' },
      { selector: '.pf-form', title: 'Tus datos', text: 'GitHub, LinkedIn, portafolio, ciudad y contacto. Tu teléfono solo lo ve el administrador.' },
      { selector: '.pf-preview', title: 'Vista previa', text: 'Así te ven tus profesores.' },
    ],
  },
  'Mis alumnos': {
    default: [
      { selector: '.pf-filters', title: 'Buscar', text: 'Busca por nombre, ciudad o titular y filtra por componente.' },
      { selector: '.pf-card', title: 'Perfil', text: 'Sus links para conectar con el talento. “Ver perfil” muestra su descripción.' },
    ],
  },
  Alumnos: {
    default: [
      { selector: '.pf-filters', title: 'Buscar y filtrar', text: 'Busca en todos los alumnos o filtra por tenant y programa. “Agrupar” los separa por tenant o por programa.' },
      { selector: '.pf-section-title, .pf-card', title: 'Grupos', text: 'Cada sección muestra cuántos alumnos tiene. Las etiquetas de cada tarjeta indican su tenant y programas.' },
      { selector: '.pf-card', title: 'Contacto', text: 'Links, correo y teléfono (solo para administradores). “Ver perfil” abre todo el detalle.' },
    ],
  },
  'Mi disponibilidad': {
    default: [
      { selector: '.av-presets', title: 'Agregar rápido', text: 'Carga franjas típicas (mañanas, tardes, noches, sábados) en un clic.' },
      { selector: '.av-days', title: 'Por día', text: 'Ajusta las horas de cada día, agrega o quita franjas.' },
      { selector: '.av-foot', title: 'Guardar', text: 'Guarda la disponibilidad de este programa. Cuando el administrador cierre el horario ya no podrás cambiarla.' },
    ],
  },
  Cursos: {
    default: [
      { selector: '.cc-filters', title: 'Buscar', text: 'Filtra por curso, programa o profesor, o mira solo los cursos en que te inscribiste.' },
      { selector: '.cc-list', title: 'Inscribirte', text: '“Inscribirme” te anota como alumno. Si un curso se cruza con tus clases (las que dictas o cursas) no se puede.' },
      { selector: '.sch-head', title: 'Cursar', text: 'Cuando estés inscrito, “Cursar en modo alumno” (o el botón Modo alumno de arriba) abre tu vista de alumno.' },
    ],
  },
  Programas: {
    default: [
      { selector: '.admin-form-panel', title: 'Nuevo programa', text: 'Crea el programa con su nombre, cohorte, fechas y colores.' },
      { selector: '.admin-table', title: 'Estructura', text: '“Editar” cambia nombre, cohorte, descripción, modalidad y fechas. “Ver componentes” → grupos (con su profesor) → temario. Puedes cargar los temas por Excel.' },
    ],
  },
  Usuarios: {
    default: [
      { selector: '.pwreset-panel', title: 'Recuperación de clave', text: 'Si alguien olvidó su contraseña, genera aquí su enlace de un solo uso.' },
      { selector: '.admin-form-panel', title: 'Nuevo usuario', text: 'Crea el usuario: recibirá un enlace para crear su contraseña. También hay carga masiva por Excel.' },
      { selector: '.admin-table', title: 'Usuarios', text: 'Filtra por tenant y rol, reenvía invitaciones o desactiva cuentas.' },
    ],
  },
  Calendario: {
    default: [
      { selector: '.holiday-loader', title: 'Feriados de Perú', text: 'Elige el año y toca “Recargar feriados”. Las clases nunca se programan en feriado.' },
      { selector: '.holiday-loader + .admin-form-panel', title: 'Otros días', text: 'Agrega a mano los días no laborables que decrete el gobierno.' },
    ],
  },
  Horarios: {
    default: [
      { selector: '.sch-head', title: 'Programa', text: 'Elige el programa (el super admin elige primero el tenant).' },
      { selector: '.sch-assign', title: '1. Quién dicta cada curso', text: 'Asigna el profesor de cada grupo. Los componentes sin profesor se marcan arriba y no se programan.' },
      { selector: '.sch-windows', title: '2. Días y horas de clase', text: 'Define las franjas del programa (p. ej. L–V 18:30–20:00 y 20:30–22:00). Las clases y la disponibilidad solo caen ahí.' },
      { selector: '.sch-instructors', title: '3. Disponibilidad', text: 'La disponibilidad es por programa y dentro de las franjas. Regístrala tú o deja que cada profesor la marque en “Mi disponibilidad”.' },
      { selector: '.sch-options', title: '4. Reglas', text: 'Fecha de inicio, clases por semana, duración y si los componentes van uno tras otro.' },
      { selector: '.sch-actions', title: '5. Generar y cerrar', text: '“Ver vista previa”, luego “Generar horarios y fechas”. Al final “Cerrar horario”: la disponibilidad queda fija.' },
    ],
  },
  Inscripciones: { default: [{ selector: PANEL, title: 'Preinscripciones', text: 'Las personas que se preinscribieron desde la web pública del programa. Confírmalas o recházalas.' }] },
  'Satisfacción': {
    default: [
      { selector: '.sf-kpis', title: 'Indicadores', text: 'Satisfacción promedio, votos, pedidos de repetir y comentarios.' },
      { selector: '.sf-wrap .pg-tabs', title: 'Pestañas', text: 'Resumen por programa, curso y profesor; pedidos de repetir; comentarios; y el reporte con IA.' },
    ],
  },
  Inasistencias: {
    default: [
      { selector: '.ind-wrap .pg-tabs', title: 'Alumnos, profesores y cambios', text: 'Cambia entre las inasistencias de alumnos, las de profesores y el historial de cambios de profesor.' },
      { selector: '.ind-kpis', title: 'Indicadores', text: 'Cuántos avisaron con anticipación, justificaron después o no justificaron.' },
      { selector: '.ind-table', title: 'Por persona', text: 'El detalle por alumno o profesor. “Historial” muestra cada inasistencia.' },
    ],
  },
  Soporte: {
    default: [
      { selector: '.sp-head', title: 'Soporte', text: 'Incidencias, observaciones y mejoras. Para reportar desde cualquier pantalla usa “Reportar” arriba: se adjunta una captura.' },
      { selector: '.pf-filters', title: 'Filtrar', text: 'Busca y filtra por estado y tipo.' },
      { selector: '.sp-item', title: 'Conversación', text: 'Abre un reporte para ver la captura y responder.' },
    ],
  },
  Ayuda: {
    default: [
      { selector: '.help-guide', title: 'Guía completa', text: 'Vuelve a ver el recorrido general de la plataforma.' },
      { selector: '.help-search', title: 'Buscar', text: 'Busca cualquier tema en el manual de tu rol.' },
      { selector: '.help-toc', title: 'Contenido', text: 'Salta directo a cada sección del manual.' },
    ],
  },
  'Mi inducción': {
    default: [
      { selector: '.ij-summary', title: 'Tu avance', text: 'Cuántos pasos obligatorios llevas. La inducción se cumple al terminarlos todos.' },
      { selector: '.ij-stage.current, .ij-path', title: 'Tu camino', text: 'Cada etapa es un tramo del camino. Si van en orden, la siguiente se abre al completar los obligatorios de la anterior.' },
      { selector: '.ij-step.todo, .ij-step', title: 'Cada paso', text: 'Toca un paso para ver el video, abrir la lectura, unirte a la sesión o responder el cuestionario. Los cuestionarios tienen nota mínima.' },
    ],
  },
  'Inducción': {
    default: [
      { selector: '.ij-head', title: 'Tus inducciones', text: 'Elige la inducción o crea una nueva.' },
      { selector: '.ind-kpis', title: 'Quién cumplió', text: 'Inscritos, cuántos completaron todo lo obligatorio, avance y nota promedio, y quiénes no empezaron.' },
      { selector: '.ij-funnel', title: 'Dónde reforzar', text: 'Los pasos obligatorios con menos avance o con notas bajas aparecen primero.' },
      { selector: '.ij-matrix', title: 'Cada persona', text: 'El camino de cada uno en puntos de color. Toca un nombre para ver su recorrido con notas y fechas.' },
      { selector: '.wb-tabs, .ij-wrap .pg-tabs', title: 'Camino y alumnos', text: 'En “Camino y pasos” armas las etapas y pasos (videos, lecturas, cuestionarios, sesiones de Teams); en “Alumnos” inscribes a las personas.' },
    ],
  },
  Tenants: { default: [{ selector: '.admin-form-panel', title: 'Nuevo tenant', text: 'Crea la organización con su slug y contacto.' }, { selector: '.admin-table', title: 'Tenants', text: 'Logo, color, enlace de acceso propio y acceso a sus usuarios.' }] },
  Reportes: { default: [{ selector: PANEL, title: 'Reportes', text: 'Elige un reporte (asistencia, avance, cumplimiento…) y revisa sus datos.' }] },
  'Mi cuenta': { default: [{ selector: '.admin-form', title: 'Tu contraseña', text: 'Cámbiala cuando quieras con tu contraseña actual. Si la olvidaste, usa “¿Olvidaste tu contraseña?” en el login.' }] },
  Configuracion: { default: [{ selector: PANEL, title: 'Configuración', text: 'Marca de tu organización (logo, color, enlace de acceso) y tu contraseña.' }] },
}
const ROLE_KEY = { student: 'student', instructor: 'instructor', admin: 'admin', superAdmin: 'admin' }

export function screenGuideSteps(section, role) {
  const guide = SCREEN_GUIDES[section]
  return guide ? guide[ROLE_KEY[role]] || guide.default : null
}

// Boton "Guía" de la barra superior: abre la guia de la pantalla actual.
export function ScreenGuideButton({ onOpen }) {
  return (
    <button type="button" className="icon-button sp-report-btn gd-btn" onClick={onOpen} title="Guía paso a paso de esta pantalla" data-no-capture>
      <Compass size={18} aria-hidden="true" /><span className="sp-report-label">Guía</span>
    </button>
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
// Secciones que comparten varios roles (pantallas iguales para todos).
const ALERTS_SECTION = { id: 'alertas', title: 'Alertas', nav: 'Alertas', body: 'Los avisos del sistema para ti.', steps: ['La campana de arriba muestra un punto rojo cuando tienes alertas sin leer.', 'Abre Alertas para ver cada aviso: inasistencias, solicitudes, respuestas de soporte, materiales listos y más.', 'Márcalas como leídas cuando las atiendas.'] }
const HELP_SECTION = { id: 'ayuda', title: 'Ayuda y guías', nav: 'Ayuda', body: 'Este manual y las guías paso a paso.', steps: ['“Ver la guía” repite el recorrido de bienvenida.', 'Busca cualquier tema en el buscador o salta a una sección desde el índice.', 'En cualquier pantalla, el botón “Guía” de arriba explica esa pantalla paso a paso.'] }
const ACCOUNT_SECTION = { id: 'cuenta', title: 'Mi cuenta y contraseña', nav: 'Mi cuenta', body: 'Cambia tu contraseña.', steps: ['Escribe tu contraseña actual y la nueva (mínimo 8 caracteres, con letras y números).', 'Guarda los cambios.'], tips: ['Si la olvidaste, en el login toca “¿Olvidaste tu contraseña?”: tu administrador te enviará un enlace para crear una nueva.'] }
const COURSES_SECTION = { id: 'cursos', title: 'Cursos: inscribirte como alumno', nav: 'Cursos', body: 'Puedes cursar como alumno los cursos de los programas vigentes.', steps: ['Busca el curso por nombre, programa o profesor (o marca “Solo mis cursos”).', 'Toca “Inscribirme”. Si dice “Se cruza con tu horario”, choca a la misma fecha y hora con una clase que dictas o que ya cursas.', '“Darme de baja” te retira del curso.', 'Para cursar, toca “Modo alumno” arriba (o “Cursar en modo alumno”); “Volver a mi rol” te regresa.'], tips: ['No aparecen los cursos que dictas: nadie cursa lo que enseña.', 'Mismo día y hora pero en otra fecha sí se puede: solo se bloquea el cruce real.'] }
const REPORTS_SECTION = { id: 'reportes', title: 'Reportes', nav: 'Reportes', body: 'Reportes listos para revisar la operación.', steps: ['Elige el reporte: inasistencias justificadas y no justificadas, avance por programa o por componente, cumplimiento de profesores, temas atrasados o adelantados y resumen de permisos.', 'Para el comparativo por periodo, elige las fechas desde y hasta.', 'Revisa la tabla con los resultados.'] }


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
      { id: 'inicio', title: 'Inicio', nav: 'Inicio', body: 'Tu resumen del día.', steps: ['Arriba, en todas las pantallas, ves tu próxima clase con el botón para unirte a la reunión.', 'Debajo tienes tu asistencia, tus temas pendientes y tus próximas sesiones.', 'Usa los atajos para ir directo a tu horario o a tus temas.'], tips: ['“Guía” (arriba) explica cualquier pantalla paso a paso.'] },
      { id: 'induccion', title: 'Mi inducción', nav: 'Mi inducción', body: 'Tu camino de inducción, paso a paso.', steps: ['Arriba ves cuántos pasos obligatorios llevas.', 'Toca un paso para ver el video, abrir la lectura, unirte a la sesión en vivo o responder el cuestionario.', 'Al terminar un paso, márcalo como hecho; los cuestionarios se califican solos y tienen nota mínima.', 'Si las etapas van en orden, la siguiente se abre al completar los pasos obligatorios de la anterior.'], tips: ['Si no apruebas un cuestionario, ves las respuestas correctas y puedes reintentar: queda tu mejor nota.'] },
      ALERTS_SECTION,
      HELP_SECTION,
      ACCOUNT_SECTION,
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
      { id: 'disponibilidad', title: 'Mi disponibilidad', nav: 'Mi disponibilidad', body: 'Tu disponibilidad por programa: con ella se genera el horario de tus cursos.', steps: ['Si dictas en varios programas, elige el programa arriba.', 'Si el programa tiene franjas de clase, marca en cuáles puedes dictar.', 'Si no tiene, usa “Agregar rápido” o agrega franjas por día y ajusta las horas.', 'Guarda.'], tips: ['Solo aparecen los programas donde el administrador te asignó un curso.', 'Cuando el horario del programa se cierra, la disponibilidad ya no se puede cambiar.'] },
      { id: 'modo-alumno', title: 'Cursar como alumno (Modo alumno)', nav: 'Inicio', body: 'Puedes inscribirte tú mismo como alumno en cursos de programas vigentes y cursarlos con la vista de alumno.', steps: ['En “Cursos” toca “Inscribirme” en el curso que quieras (no aparecen los que dictas; los que se cruzan con tus clases están bloqueados).', 'Toca “Modo alumno” arriba a la derecha.', 'Verás tus temas, tu horario y tu asistencia como cualquier alumno.', 'Toca “Volver a mi rol” para regresar.'], tips: ['Nunca puedes cursar un componente que tú mismo dictas.'] },
      { id: 'avisos', title: 'Avisos de inasistencia', nav: 'Permisos', body: 'Los avisos de tus alumnos y los tuyos.', steps: ['Revisa los avisos de tus alumnos para tus clases (el administrador los aprueba).', 'Tus propios avisos aparecen en “Mis avisos de inasistencia”; puedes retirarlos si la clase no pasó.'], tips: ['Avisar con anticipación mejora tu indicador de puntualidad del aviso.'] },
      { id: 'soporte', title: 'Reportar un problema', nav: 'Soporte', body: 'Usa “Reportar” en la barra superior desde la pantalla con el problema: la captura se adjunta sola.', steps: [], tips: [] },
      { id: 'temarios', title: 'Temarios', nav: 'Temarios', body: 'El temario de cada uno de tus grupos.', steps: ['Elige el grupo arriba (y el programa si tienes varios).', 'Ves cuántos temas dictaste, cuántos están atrasados y tu próxima clase.', 'En cada tema: fecha, estado, asistencia y la opinión de los alumnos; desde ahí registras asistencia o abres el material.', '“Clase” guarda el link de la reunión (para esa clase o para todo el grupo), la grabación, notas y archivos para tus alumnos.'] },
      { id: 'asistencia-grupos', title: 'Asistencia de tus grupos', nav: 'Asistencia', body: 'Registra y revisa la asistencia.', steps: ['Elige el grupo.', 'En “Clases por registrar” toca Registrar: todos empiezan como Presente y marcas solo ausentes, tardanzas o retiros.', 'Revisa los avisos de inasistencia de tus alumnos para tus próximas clases.', 'El récord del grupo muestra cada sesión y el porcentaje de cada alumno.'] },
      COURSES_SECTION,
      ALERTS_SECTION,
      HELP_SECTION,
      ACCOUNT_SECTION,
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
      { id: 'horarios', title: 'Generar horarios automáticamente', nav: 'Horarios', body: 'Por programa: quién dicta, disponibilidad, días, hora y fechas de todos los temas, sin cruces.', steps: ['Elige el programa (el super admin elige primero el tenant).', 'Paso 1: asigna el profesor de cada grupo. Arriba se alerta qué componentes siguen sin profesor; esos no se programan.', 'Paso 2: define los días y horas de clase del programa (p. ej. L–V 18:30–20:00 y 20:30–22:00). Cada clase dura su franja.', 'Paso 3: revisa la disponibilidad de cada profesor para este programa; solo puede marcarse dentro de las franjas.', 'Paso 4: fecha de inicio, clases por semana y si los componentes van uno tras otro o a la vez.', 'Paso 5: “Ver vista previa”, luego “Generar horarios y fechas”. Cuando estés conforme, “Cerrar horario”.'], tips: ['En “Horario actual de los grupos” → “Editar” cambias a mano los días, las horas y la fecha de cada clase (aun con el horario cerrado).', 'Nada se cruza: un profesor no dicta dos clases el mismo día (en ningún programa), dos componentes no coinciden a la misma hora y nada cae en feriado.', 'Los temas ya dictados no se tocan.', 'Con el horario cerrado no se regenera y la disponibilidad queda fija; “Reabrir” lo habilita de nuevo.'] },
      { id: 'inscribir-personal', title: 'Inscribir profesores y admins como alumnos', nav: 'Programas', body: 'Profesores, admins y super admins también pueden cursar programas.', steps: ['Programas → Ver componentes → grupo → Inscribir alumno.', 'En la lista aparecen también profesores y admins (marcados entre paréntesis).', 'Cada uno cursa desde “Modo alumno”.'], tips: ['Nadie puede inscribirse en un componente que dicta, ni dictar uno en el que está inscrito.', 'Un profesor puede dictar varios componentes y programas vigentes: solo se impide el cruce real (misma fecha y hora).'] },
      { id: 'modo-alumno', title: 'Cursar como alumno (Modo alumno)', nav: 'Inicio', body: 'Puedes inscribirte tú mismo como alumno en cursos de programas vigentes y cursarlos con la vista de alumno.', steps: ['En “Cursos” toca “Inscribirme” en el curso que quieras (no aparecen los que dictas; los que se cruzan con tus clases están bloqueados).', 'Toca “Modo alumno” arriba a la derecha.', 'Verás tus temas, tu horario y tu asistencia como cualquier alumno.', 'Toca “Volver a mi rol” para regresar.'], tips: ['Nunca puedes cursar un componente que tú mismo dictas.'] },
      { id: 'seguimiento', title: 'Avance, asistencia y permisos', nav: 'Avance', body: 'Seguimiento diario.', steps: ['Avance: tablero por componente y tema con asistencia.', 'Permisos: aprueba o rechaza permisos y avisos de inasistencia (con su imagen de evidencia).', 'Alumnos: perfiles con datos de contacto, incluido el teléfono.'], tips: [] },
      { id: 'inasistencias', title: 'Inasistencias e indicadores', nav: 'Inasistencias', body: 'Alumnos, profesores y cambios de profesor.', steps: ['Alumnos: faltas por persona según si avisaron con anticipación, el mismo día, justificaron después o no justificaron; historial de cada uno.', 'Profesores: registra faltas (aunque no hayan avisado), márcalas justificadas o no, y revisa la puntualidad del aviso.', 'Cambios de profesor: historial con motivos, incluidas renuncias.'], tips: [] },
      { id: 'satisfaccion', title: 'Satisfacción y reporte con IA', nav: 'Satisfacción', body: 'Lo que opinan los alumnos.', steps: ['Resumen por programa, curso y profesor; temas mejor valorados y a revisar.', 'Pedidos de repetir: para planificar a futuro.', 'Comentarios: búscalos y fíltralos por tipo.', 'Reporte con IA: elige el alcance y genera un análisis con fortalezas, problemas y recomendaciones. Queda guardado.'], tips: ['A la IA no se le envían nombres de alumnos.'] },
      { id: 'soporte', title: 'Soporte', nav: 'Soporte', body: 'Incidencias, observaciones y mejoras de los usuarios.', steps: ['Abre un reporte para ver la captura de la pantalla de origen, la imagen y los datos del navegador.', 'Responde: le llega como alerta a quien reportó.', 'Cambia el estado: abierto, en atención, resuelto o cerrado.'], tips: [] },
      { id: 'induccion-admin', title: 'Inducción', nav: 'Inducción', body: 'Programas de inducción con un camino obligatorio y su tablero de cumplimiento.', steps: ['“Nueva inducción” crea el programa de inducción.', 'En “Camino y pasos” arma etapas y pasos: video, lectura, cuestionario (con nota mínima y preguntas sugeridas con IA), tarea o sesión en vivo de Teams; marca cuáles son obligatorios.', 'En “Alumnos” inscribe a las personas.', 'En “Avance” ves quién cumplió, “Dónde reforzar” y el camino de cada persona.'], tips: ['Con “las etapas se abren en orden”, nadie salta una etapa sin completar la anterior.'] },
      { id: 'inscripciones', title: 'Inscripciones desde la web', nav: 'Inscripciones', body: 'Las preinscripciones que llegan desde la web pública de cada programa.', steps: ['Revisa los datos de cada persona.', 'Confírmala para crear su usuario e inscribirla en el programa, o recházala.'], tips: ['La web pública se activa en Programas → “Web pública”.'] },
      { id: 'alumnos', title: 'Alumnos', nav: 'Alumnos', body: 'El directorio de alumnos con su perfil y contacto.', steps: ['Busca por nombre, ciudad o titular y filtra por programa (el super admin también por tenant).', '“Agrupar” los separa por tenant o por programa.', '“Ver perfil” muestra sus links, correo y teléfono.'], tips: ['También aparecen los profesores y admins que estén inscritos como alumnos.'] },
      COURSES_SECTION,
      { id: 'permisos-admin', title: 'Permisos y avisos de inasistencia', nav: 'Permisos', body: 'Las solicitudes de permiso y los avisos de inasistencia.', steps: ['Revisa cada solicitud con su motivo y fechas.', '“Ver evidencia” abre la imagen adjunta.', 'Apruébala o recházala: la persona ve la respuesta en sus alertas.'] },
      REPORTS_SECTION,
      { id: 'configuracion', title: 'Configuración', nav: 'Configuracion', body: 'La marca de tu organización y tu contraseña.', steps: ['Sube el logo y elige el color de marca: se usan en el login, el material y la web pública.', 'Copia el link de acceso propio de tu tenant para compartirlo.', 'Cambia tu contraseña con tu contraseña actual.'] },
      ALERTS_SECTION,
      HELP_SECTION,
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
  const sections = useMemo(() => manual.sections.filter((s) => !q || [s.title, s.body, ...(s.steps || []), ...(s.tips || [])].some((t) => t.toLowerCase().includes(q))), [manual, q])

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
                {s.steps?.length > 0 && <ol className="help-steps">{s.steps.map((t) => <li key={t}>{t}</li>)}</ol>}
                {s.tips?.length > 0 && <ul className="help-tips">{s.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
                {s.nav && manualKey === available[0] && navigate && <button type="button" className="btn-mini" onClick={() => navigate(s.nav)}>Ir a {s.nav} →</button>}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
