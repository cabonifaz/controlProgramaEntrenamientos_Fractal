import React, { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, CheckCircle2, Clock, ExternalLink, Layers, MapPin, Users } from 'lucide-react'
import './public.css'

// Web publica de un programa (/p/<tenant>/<programa>) y su formulario de
// preinscripcion (/p/<tenant>/<programa>/inscripcion). Sin sesion: todo
// sale de /api/public/programs/... y usa la marca (logo + color) del tenant.

export function getPublicProgramRoute() {
  const match = window.location.pathname.match(/^\/p\/([a-z0-9-]+)\/([a-z0-9-]+)(\/inscripcion)?\/?$/i)
  return match ? { tenantSlug: match[1], programSlug: match[2], view: match[3] ? 'enroll' : 'landing' } : null
}

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const COUNTRIES = [
  'Perú', 'Argentina', 'Bolivia', 'Brasil', 'Chile', 'Colombia', 'Costa Rica', 'Cuba', 'Ecuador', 'El Salvador', 'España',
  'Estados Unidos', 'Guatemala', 'Honduras', 'México', 'Nicaragua', 'Panamá', 'Paraguay', 'Puerto Rico',
  'República Dominicana', 'Uruguay', 'Venezuela', 'Otro',
]

const PUBLIC_ERRORS = {
  program_not_found: 'Este programa no existe o ya no está publicado.',
  enrollment_closed: 'Las inscripciones para este programa están cerradas.',
  already_preenrolled: 'Ya tenemos una preinscripción con este email o documento para este programa.',
  too_many_requests: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  invalid_document_type: 'Selecciona un tipo de documento válido.',
  invalid_fields: 'Revisa los campos marcados.',
}

function parseDate(iso) {
  if (!iso) return null
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatLongDate(iso) {
  const date = parseDate(iso)
  return date ? date.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : null
}

function formatShortDate(iso) {
  const date = parseDate(iso)
  return date ? date.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }) : null
}

function durationWeeks(startsOn, endsOn) {
  const start = parseDate(startsOn)
  const end = parseDate(endsOn)
  if (!start || !end || end < start) return null
  return Math.max(1, Math.round((end - start) / (7 * 24 * 3600 * 1000)))
}

// Color de texto legible sobre el color de marca (blanco u oscuro).
function readableOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#14212b' : '#ffffff'
}

function scheduleSummary(schedule) {
  const byTime = new Map()
  schedule.forEach((s) => {
    const key = `${s.start}–${s.end}`
    if (!byTime.has(key)) byTime.set(key, [])
    byTime.get(key).push(WEEKDAYS[s.weekday])
  })
  return [...byTime.entries()].map(([time, days]) => ({ days: days.join(', '), time }))
}

function usePublicProgram(tenantSlug, programSlug) {
  const [state, setState] = useState({ status: 'loading', data: null, error: '' })
  useEffect(() => {
    let cancelled = false
    fetch(`/api/public/programs/${tenantSlug}/${programSlug}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.message || 'program_not_found')
        return body.data
      })
      .then((data) => { if (!cancelled) setState({ status: 'ready', data, error: '' }) })
      .catch((err) => { if (!cancelled) setState({ status: 'error', data: null, error: err.message }) })
    return () => { cancelled = true }
  }, [tenantSlug, programSlug])
  return state
}

// Imagen con respaldo: si el archivo no carga, muestra las iniciales en
// vez de un icono de imagen rota.
function ImageOr({ src, alt, fallback }) {
  const [failed, setFailed] = useState(false)
  return src && !failed ? <img src={src} alt={alt} onError={() => setFailed(true)} /> : fallback
}

function initials(name) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('')
}

function TopBar({ tenant, enrollHref, enrollmentOpen, homeHref }) {
  return (
    <header className="pp-top">
      <a className="pp-brand" href={homeHref}>
        <ImageOr src={tenant.logoUrl} alt={tenant.name} fallback={<span className="pp-brand-mark">{tenant.name.slice(0, 1)}</span>} />
        <strong>{tenant.name}</strong>
      </a>
      {enrollHref && enrollmentOpen && <a className="pp-cta pp-cta-small" href={enrollHref}>Preinscríbete</a>}
    </header>
  )
}

function Fact({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div className="pp-fact">
      <Icon size={20} />
      <div><span>{label}</span><strong>{value}</strong></div>
    </div>
  )
}

function ProgramLanding({ data, base }) {
  const { tenant, program, components, instructors, schedule } = data
  const weeks = durationWeeks(program.startsOn, program.endsOn)
  const slots = scheduleSummary(schedule)
  const enrollHref = `${base}/inscripcion`

  return (
    <>
      <TopBar tenant={tenant} enrollHref={enrollHref} enrollmentOpen={program.enrollmentOpen} homeHref={base} />
      <section className="pp-hero">
        <div className="pp-wrap pp-hero-grid">
          <div className="pp-hero-text">
            <span className="pp-eyebrow">{program.cohort ? `Cohorte ${program.cohort}` : 'Programa de formación'}</span>
            <h1>{program.name}</h1>
            {program.tagline && <p className="pp-tagline">{program.tagline}</p>}
            <div className="pp-hero-actions">
              {program.enrollmentOpen
                ? <a className="pp-cta" href={enrollHref}>Preinscríbete ahora <ArrowRight size={18} /></a>
                : <span className="pp-closed">Inscripciones cerradas</span>}
              {program.startsOn && <span className="pp-start-pill">Inicia el {formatShortDate(program.startsOn)}</span>}
            </div>
          </div>
          {program.bannerUrl && <img className="pp-banner" src={program.bannerUrl} alt={program.name} />}
        </div>
      </section>

      <main className="pp-wrap pp-main">
        <section className="pp-facts">
          <Fact icon={CalendarDays} label="Inicio" value={formatLongDate(program.startsOn)} />
          <Fact icon={Clock} label="Duración" value={[weeks && `${weeks} semanas`, program.totalHours && `${program.totalHours} horas`].filter(Boolean).join(' · ')} />
          <Fact icon={MapPin} label="Modalidad" value={program.modality} />
          <Fact icon={Layers} label="Contenido" value={`${components.length} módulos · ${program.topicsCount} clases`} />
        </section>

        {(program.audience || program.description) && (
          <section className="pp-section pp-two-col">
            {program.description && <div><h2>Sobre el programa</h2><p className="pp-text">{program.description}</p></div>}
            {program.audience && <div className="pp-audience"><h2><Users size={22} /> ¿Para quién es?</h2><p className="pp-text">{program.audience}</p></div>}
          </section>
        )}

        {components.length > 0 && (
          <section className="pp-section">
            <h2>Temario</h2>
            <p className="pp-muted">Haz clic en cada módulo para ver sus clases.</p>
            <div className="pp-modules">
              {components.map((c, i) => {
                const hours = Math.round(c.topics.reduce((s, t) => s + (Number(t.durationMinutes) || 0), 0) / 60)
                return (
                  <details className="pp-module" key={c.id} open={i === 0}>
                    <summary>
                      <span className="pp-module-num">{String(i + 1).padStart(2, '0')}</span>
                      <span className="pp-module-title"><strong>{c.name}</strong><small>{c.topics.length} clases{hours ? ` · ${hours} h` : ''}</small></span>
                    </summary>
                    {c.description && <p className="pp-muted">{c.description}</p>}
                    <ol className="pp-topics">{c.topics.map((t) => <li key={t.position}>{t.title}</li>)}</ol>
                  </details>
                )
              })}
            </div>
          </section>
        )}

        {instructors.length > 0 && (
          <section className="pp-section">
            <h2>{instructors.length === 1 ? 'Tu instructor' : 'Tus instructores'}</h2>
            <div className="pp-instructors">
              {instructors.map((ins) => (
                <article className="pp-instructor" key={ins.name}>
                  <ImageOr src={ins.photoUrl} alt={ins.name} fallback={<div className="pp-avatar">{initials(ins.name)}</div>} />
                  <div>
                    <h3>{ins.name}</h3>
                    {ins.headline && <p className="pp-headline">{ins.headline}</p>}
                    {ins.components && <p className="pp-teaches">Dicta: {ins.components}</p>}
                    {ins.bio && <p className="pp-text">{ins.bio}</p>}
                    {ins.linkedinUrl && <a className="pp-linkedin" href={ins.linkedinUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Ver perfil en LinkedIn</a>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {slots.length > 0 && (
          <section className="pp-section">
            <h2>Horarios</h2>
            <div className="pp-slots">
              {slots.map((s) => <div className="pp-slot" key={s.days + s.time}><strong>{s.days}</strong><span>{s.time}</span></div>)}
            </div>
          </section>
        )}

        {program.enrollmentOpen && (
          <section className="pp-final-cta">
            <h2>¿Listo para empezar?</h2>
            <p>Déjanos tus datos y el equipo de {tenant.name} confirmará tu cupo.</p>
            <a className="pp-cta pp-cta-inverse" href={enrollHref}>Quiero preinscribirme <ArrowRight size={18} /></a>
          </section>
        )}
      </main>
      <footer className="pp-footer">© {new Date().getFullYear()} {tenant.name}</footer>
    </>
  )
}

const EMPTY_FORM = { fullName: '', email: '', phone: '', corporateEmail: '', documentTypeCode: 'dni', documentNumber: '', country: 'Perú', consent: false, website: '' }

function EnrollForm({ data, base, tenantSlug, programSlug }) {
  const { tenant, program } = data
  const [form, setForm] = useState(EMPTY_FORM)
  const [docTypes, setDocTypes] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [invalidFields, setInvalidFields] = useState([])

  useEffect(() => {
    fetch('/api/catalogs/DOCUMENT_TYPE').then((r) => r.json()).then((b) => setDocTypes(b.data || [])).catch(() => {})
  }, [])

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const fieldClass = (field) => (invalidFields.includes(field) ? 'pp-field invalid' : 'pp-field')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInvalidFields([])
    setStatus('sending')
    try {
      const res = await fetch(`/api/public/programs/${tenantSlug}/${programSlug}/pre-enrollments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setInvalidFields(body.fields || [])
        throw new Error(body.message || 'error')
      }
      setStatus('done')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(PUBLIC_ERRORS[err.message] || 'No pudimos enviar tu preinscripción. Inténtalo de nuevo.')
      setStatus('idle')
    }
  }

  return (
    <>
      <TopBar tenant={tenant} homeHref={base} />
      <main className="pp-wrap pp-enroll">
        <aside className="pp-enroll-summary">
          {program.bannerUrl && <img src={program.bannerUrl} alt={program.name} />}
          <span className="pp-eyebrow pp-eyebrow-dark">Preinscripción</span>
          <h1>{program.name}</h1>
          {program.tagline && <p className="pp-muted">{program.tagline}</p>}
          <ul>
            {program.startsOn && <li><CalendarDays size={18} /> Inicia el {formatLongDate(program.startsOn)}</li>}
            {program.modality && <li><MapPin size={18} /> {program.modality}</li>}
          </ul>
          <a className="pp-back" href={base}>← Ver el programa completo</a>
        </aside>

        <section className="pp-enroll-card">
          {status === 'done' ? (
            <div className="pp-success">
              <CheckCircle2 size={56} />
              <h2>¡Recibimos tu preinscripción!</h2>
              <p>El equipo de {tenant.name} revisará tus datos y te contactará para confirmar tu cupo y darte acceso a la plataforma.</p>
              <a className="pp-cta" href={base}>Volver al programa</a>
            </div>
          ) : !program.enrollmentOpen ? (
            <div className="pp-success"><h2>Inscripciones cerradas</h2><p>Por ahora este programa no recibe nuevas preinscripciones.</p></div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <h2>Tus datos</h2>
              <p className="pp-muted">Completa el formulario. Los campos con * son obligatorios.</p>
              <div className="pp-form-grid">
                <label className={`${fieldClass('fullName')} pp-span-2`}>Nombres y apellidos completos *
                  <input value={form.fullName} onChange={set('fullName')} autoComplete="name" required maxLength={160} />
                </label>
                <label className={fieldClass('email')}>Email personal *
                  <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required maxLength={190} />
                </label>
                <label className={fieldClass('phone')}>Celular *
                  <input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="+51 999 999 999" required maxLength={40} />
                </label>
                <label className={`${fieldClass('corporateEmail')} pp-span-2`}>Email corporativo (opcional)
                  <input type="email" value={form.corporateEmail} onChange={set('corporateEmail')} maxLength={190} />
                </label>
                <label className={fieldClass('documentTypeCode')}>Tipo de documento *
                  <select value={form.documentTypeCode} onChange={set('documentTypeCode')}>
                    {(docTypes.length ? docTypes : [{ code: 'dni', label: 'DNI' }]).map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
                  </select>
                </label>
                <label className={fieldClass('documentNumber')}>Número de documento *
                  <input value={form.documentNumber} onChange={set('documentNumber')} required maxLength={40} />
                </label>
                <label className={`${fieldClass('country')} pp-span-2`}>País *
                  <select value={form.country} onChange={set('country')}>
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="pp-honeypot" aria-hidden="true">Sitio web
                  <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
                </label>
                <label className={`pp-consent pp-span-2 ${invalidFields.includes('consent') ? 'invalid' : ''}`}>
                  <input type="checkbox" checked={form.consent} onChange={set('consent')} />
                  <span>Autorizo a {tenant.name} a tratar mis datos personales para gestionar mi inscripción en este programa.</span>
                </label>
              </div>
              {error && <p className="pp-error">{error}</p>}
              <button className="pp-cta pp-submit" disabled={status === 'sending'}>
                {status === 'sending' ? 'Enviando…' : 'Enviar preinscripción'}
              </button>
            </form>
          )}
        </section>
      </main>
      <footer className="pp-footer">© {new Date().getFullYear()} {tenant.name}</footer>
    </>
  )
}

export function PublicProgramApp({ tenantSlug, programSlug, view }) {
  const { status, data, error } = usePublicProgram(tenantSlug, programSlug)
  const base = `/p/${tenantSlug}/${programSlug}`
  const brand = data?.tenant.brandColor || '#087fb8'
  const style = useMemo(() => ({ '--brand': brand, '--on-brand': readableOn(brand) }), [brand])

  useEffect(() => {
    if (data) document.title = `${data.program.name} · ${data.tenant.name}`
  }, [data])

  if (status === 'loading') return <div className="pp-shell pp-center" style={style}><p className="pp-muted">Cargando…</p></div>
  if (status === 'error') {
    return (
      <div className="pp-shell pp-center" style={style}>
        <div className="pp-notfound"><h1>Programa no disponible</h1><p className="pp-muted">{PUBLIC_ERRORS[error] || PUBLIC_ERRORS.program_not_found}</p></div>
      </div>
    )
  }
  return (
    <div className="pp-shell" style={style}>
      {view === 'enroll'
        ? <EnrollForm data={data} base={base} tenantSlug={tenantSlug} programSlug={programSlug} />
        : <ProgramLanding data={data} base={base} />}
    </div>
  )
}
