import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Camera, Globe, Lock, Mail, MapPin, Phone, Search } from 'lucide-react'
import { apiRequest, apiUpload } from './api'
import { ErrorNote, Modal } from './admin.jsx'

// Perfil del alumno (links y contacto para conectar con el talento) y el
// directorio que ven sus instructores y el admin. El telefono solo llega
// al admin: el servidor no lo manda al instructor.

export const PROFILE_PHOTO_EVENT = 'profile-photo-changed'
const BIO_MAX = 500
const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function GithubIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function LinkedinIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 110-4.13 2.06 2.06 0 010 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  )
}

const initials = (name = '') => name.split(' ').filter(Boolean).map((x) => x[0]).join('').slice(0, 2).toUpperCase()

export function Avatar({ name, photoUrl, size = 48 }) {
  return photoUrl
    ? <img className="pf-avatar" src={photoUrl} alt="" style={{ width: size, height: size }} />
    : <span className="pf-avatar pf-avatar-empty" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">{initials(name)}</span>
}

// Links de contacto de un perfil, en el orden en que se suelen buscar.
function contactLinks(profile, showPhone) {
  const links = []
  if (profile.githubUrl) links.push({ key: 'github', href: profile.githubUrl, label: 'GitHub', icon: <GithubIcon /> })
  if (profile.linkedinUrl) links.push({ key: 'linkedin', href: profile.linkedinUrl, label: 'LinkedIn', icon: <LinkedinIcon /> })
  if (profile.portfolioUrl) links.push({ key: 'web', href: profile.portfolioUrl, label: 'Portafolio', icon: <Globe size={14} aria-hidden="true" /> })
  const email = profile.contactEmail || profile.email
  if (email) links.push({ key: 'mail', href: `mailto:${email}`, label: email, icon: <Mail size={14} aria-hidden="true" />, text: true })
  if (showPhone && profile.phone) links.push({ key: 'phone', href: `tel:${profile.phone.replace(/[^0-9+]/g, '')}`, label: profile.phone, icon: <Phone size={14} aria-hidden="true" />, text: true })
  return links
}

function ContactLinks({ profile, showPhone }) {
  const links = contactLinks(profile, showPhone)
  if (!links.length) return <p className="muted pf-empty-links">Todavía no dejó links de contacto.</p>
  return (
    <ul className="pf-links">
      {links.map((l) => (
        <li key={l.key}>
          <a href={l.href} target={l.text ? undefined : '_blank'} rel="noreferrer" className={l.text ? 'pf-link pf-link-text' : 'pf-link'}>
            {l.icon}<span>{l.label}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

function StudentCard({ profile, showPhone, onOpen }) {
  return (
    <article className="pf-card">
      <div className="pf-card-head">
        <Avatar name={profile.fullName} photoUrl={profile.photoUrl} size={52} />
        <div className="pf-card-id">
          <h4>{profile.fullName}</h4>
          {profile.headline && <p className="pf-headline">{profile.headline}</p>}
          {profile.city && <p className="pf-meta"><MapPin size={12} aria-hidden="true" /> {profile.city}</p>}
        </div>
      </div>
      {profile.components && <p className="pf-components" title={profile.components}>{profile.components}</p>}
      <ContactLinks profile={profile} showPhone={showPhone} />
      {onOpen && <button type="button" className="btn-mini pf-open" onClick={() => onOpen(profile)}>Ver perfil</button>}
    </article>
  )
}

function ProfileDetail({ profile, showPhone }) {
  return (
    <div className="pf-detail">
      <div className="pf-card-head">
        <Avatar name={profile.fullName} photoUrl={profile.photoUrl} size={84} />
        <div className="pf-card-id">
          <h4>{profile.fullName}</h4>
          {profile.headline && <p className="pf-headline">{profile.headline}</p>}
          {profile.city && <p className="pf-meta"><MapPin size={12} aria-hidden="true" /> {profile.city}</p>}
        </div>
      </div>
      {profile.bio ? <p className="pf-bio">{profile.bio}</p> : <p className="muted">Sin descripción.</p>}
      <dl className="pf-dl">
        {profile.programs && <div><dt>Programa</dt><dd>{profile.programs}</dd></div>}
        {profile.components && <div><dt>Componentes</dt><dd>{profile.components}</dd></div>}
        <div><dt>Correo de acceso</dt><dd>{profile.email}</dd></div>
        {showPhone && <div><dt>Teléfono</dt><dd>{profile.phone || '—'}</dd></div>}
      </dl>
      <ContactLinks profile={profile} showPhone={showPhone} />
    </div>
  )
}

// ===================================================================
// "Mi perfil" del alumno.
const EMPTY_FORM = { headline: '', city: '', githubUrl: '', linkedinUrl: '', portfolioUrl: '', contactEmail: '', phone: '', bio: '' }

export function StudentProfilePanel({ session }) {
  const { token } = session
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [saving, setSaving] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await apiRequest('/api/me/profile', { token })
      setProfile(data)
      setForm(Object.fromEntries(Object.keys(EMPTY_FORM).map((k) => [k, data?.[k] || ''])))
    } catch (err) {
      setError(err.message)
    }
  }, [token])
  useEffect(() => { load() }, [load])

  const set = (key) => (e) => { setForm({ ...form, [key]: e.target.value }); setSaved('') }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved('')
    try {
      await apiRequest('/api/me/profile', { method: 'POST', token, body: form })
      setSaved('Perfil guardado.')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function uploadPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!PHOTO_TYPES.includes(file.type)) { setPhotoError('invalid_file_type'); return }
    if (file.size > 5 * 1024 * 1024) { setPhotoError('image_too_large'); return }
    setPhotoBusy(true)
    setPhotoError('')
    try {
      const formData = new FormData()
      formData.append('image', file)
      const { photoUrl } = await apiUpload('/api/me/photo', { token, formData })
      setProfile((p) => ({ ...p, photoUrl }))
      window.dispatchEvent(new CustomEvent(PROFILE_PHOTO_EVENT, { detail: photoUrl }))
    } catch (err) {
      setPhotoError(err.message)
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removePhoto() {
    setPhotoBusy(true)
    setPhotoError('')
    try {
      await apiRequest('/api/me/photo', { method: 'DELETE', token })
      setProfile((p) => ({ ...p, photoUrl: null }))
      window.dispatchEvent(new CustomEvent(PROFILE_PHOTO_EVENT, { detail: null }))
    } catch (err) {
      setPhotoError(err.message)
    } finally {
      setPhotoBusy(false)
    }
  }

  if (!profile) return <div className="admin-wrap"><ErrorNote message={error} />{!error && <p className="muted">Cargando…</p>}</div>

  const preview = { ...profile, ...form }
  return (
    <div className="admin-wrap pf-wrap">
      <section className="panel pf-photo-panel">
        <Avatar name={profile.fullName} photoUrl={profile.photoUrl} size={96} />
        <div className="pf-photo-copy">
          <h3>{profile.fullName}</h3>
          <p className="muted">{profile.email}</p>
          <p className="muted pf-photo-hint">Una foto tuya o una imagen que te identifique (logo, avatar). PNG, JPG o WEBP · máx. 5 MB.</p>
          <div className="pf-photo-actions">
            <label className={photoBusy ? 'btn-mini pf-upload disabled' : 'btn-mini pf-upload'}>
              <Camera size={14} aria-hidden="true" /> {photoBusy ? 'Subiendo…' : profile.photoUrl ? 'Cambiar imagen' : 'Subir imagen'}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadPhoto} disabled={photoBusy} className="sr-only" />
            </label>
            {profile.photoUrl && <button type="button" className="btn-mini" onClick={removePhoto} disabled={photoBusy}>Quitar</button>}
          </div>
          <ErrorNote message={photoError} />
        </div>
      </section>

      <div className="pf-grid">
        <section className="panel admin-form-panel">
          <h3>Tu perfil profesional</h3>
          <p className="muted">Tus profesores y el administrador lo ven para conocerte y contactarte por oportunidades.</p>
          <form className="admin-form pf-form" onSubmit={save}>
            <label className="full-field">Titular<input value={form.headline} onChange={set('headline')} maxLength={160} placeholder="Ej.: Desarrolladora full-stack en formación" /></label>
            <label>GitHub<input type="url" value={form.githubUrl} onChange={set('githubUrl')} placeholder="https://github.com/usuario" /></label>
            <label>LinkedIn<input type="url" value={form.linkedinUrl} onChange={set('linkedinUrl')} placeholder="https://www.linkedin.com/in/usuario" /></label>
            <label>Portafolio o web<input type="url" value={form.portfolioUrl} onChange={set('portfolioUrl')} placeholder="https://…" /></label>
            <label>Ciudad<input value={form.city} onChange={set('city')} maxLength={120} placeholder="Ej.: Bogotá" /></label>
            <label>Correo de contacto<input type="email" value={form.contactEmail} onChange={set('contactEmail')} maxLength={190} placeholder={profile.email} /></label>
            <label>Teléfono
              <input type="tel" value={form.phone} onChange={set('phone')} maxLength={40} placeholder="+57 300 000 0000" />
              <span className="pf-private"><Lock size={11} aria-hidden="true" /> Solo lo ve el administrador</span>
            </label>
            <label className="full-field">Sobre ti
              <textarea value={form.bio} onChange={set('bio')} maxLength={BIO_MAX} placeholder="Qué te interesa, en qué estás trabajando, qué buscas…" />
              <span className={form.bio.length >= BIO_MAX ? 'pf-count limit' : 'pf-count'}>{form.bio.length}/{BIO_MAX}</span>
            </label>
            <ErrorNote message={error} />
            {saved && <p className="st-done" role="status">{saved}</p>}
            <button className="primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar perfil'}</button>
          </form>
        </section>

        <section className="panel pf-preview">
          <h3>Así te ven tus profesores</h3>
          <p className="muted">Sin tu teléfono: ese dato solo lo ve el administrador.</p>
          <StudentCard profile={preview} showPhone={false} />
        </section>
      </div>
    </div>
  )
}

// ===================================================================
// Directorio de alumnos: "Mis alumnos" (instructor) y "Alumnos" (admin).
export function StudentDirectoryPanel({ session }) {
  const { token, profile: me } = session
  const isInstructor = me.roleCode === 'instructor'
  const showPhone = !isInstructor
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [component, setComponent] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    apiRequest('/api/students/profiles', { token }).then(({ data }) => setItems(data)).catch((err) => setError(err.message))
  }, [token])

  const components = useMemo(() => {
    const set = new Set()
    for (const p of items || []) for (const c of (p.components || '').split(' · ').filter(Boolean)) set.add(c)
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (items || []).filter((p) => {
      if (component && !(p.components || '').split(' · ').includes(component)) return false
      if (!q) return true
      return [p.fullName, p.headline, p.city, p.components, p.email].some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [items, query, component])

  const stats = useMemo(() => {
    const list = items || []
    return { total: list.length, github: list.filter((p) => p.githubUrl).length, linkedin: list.filter((p) => p.linkedinUrl).length }
  }, [items])

  return (
    <div className="admin-wrap">
      <section className="panel">
        <div className="pf-dir-head">
          <div>
            <h3>{isInstructor ? 'Mis alumnos' : 'Alumnos'}</h3>
            <p className="muted">
              {isInstructor ? 'Alumnos de tus grupos, con sus links para conectar con el talento.' : 'Perfiles de los alumnos del tenant, con sus datos de contacto.'}
              {items && ` ${stats.total} ${stats.total === 1 ? 'alumno' : 'alumnos'} ·${stats.github} con GitHub · ${stats.linkedin} con LinkedIn.`}
            </p>
          </div>
        </div>
        <div className="pf-filters">
          <label className="pf-search">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Buscar alumno</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, ciudad, titular…" />
          </label>
          {components.length > 1 && (
            <label className="pf-select">
              <span className="sr-only">Componente</span>
              <select value={component} onChange={(e) => setComponent(e.target.value)}>
                <option value="">Todos los componentes</option>
                {components.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}
        </div>
        <ErrorNote message={error} />
        {!items && !error && <p className="muted">Cargando…</p>}
        {items && !filtered.length && <p className="muted">{items.length ? 'Ningún alumno coincide con la búsqueda.' : 'Todavía no hay alumnos.'}</p>}
        <div className="pf-cards">
          {filtered.map((p) => <StudentCard key={p.id} profile={p} showPhone={showPhone} onOpen={setOpen} />)}
        </div>
      </section>
      {open && (
        <Modal title="Perfil del alumno" onClose={() => setOpen(null)} wide>
          <ProfileDetail profile={open} showPhone={showPhone} />
        </Modal>
      )}
    </div>
  )
}
