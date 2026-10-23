// Sesion persistida en el navegador para que recargar la pagina no cierre
// la sesion. "Recordarme" -> localStorage (sobrevive a cerrar el navegador);
// sin marcar -> sessionStorage (dura lo que la pestana). El servidor sigue
// siendo quien valida el token en cada llamada.

const SESSION_KEY = 'fractal-session'
const SECTION_KEY = 'fractal-active-section'

// Algunos navegadores (modo privado, almacenamiento bloqueado) lanzan al
// tocar el storage: en ese caso simplemente no se recuerda nada.
function safe(fn, fallback = null) {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export function saveSession(session, remember) {
  safe(() => {
    const [keep, drop] = remember ? [localStorage, sessionStorage] : [sessionStorage, localStorage]
    keep.setItem(SESSION_KEY, JSON.stringify(session))
    drop.removeItem(SESSION_KEY)
  })
}

export function clearSession() {
  safe(() => {
    localStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(SECTION_KEY)
  })
}

function tokenExpired(token) {
  return safe(() => {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()
  }, true)
}

// Sesion guardada y todavia vigente (o null).
export function loadSession() {
  const session = safe(() => JSON.parse(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || 'null'))
  if (!session?.token || !session?.role || tokenExpired(session.token)) {
    clearSession()
    return null
  }
  return session
}

// Seccion del menu activa, para volver a ella al recargar.
export function loadActiveSection() {
  return safe(() => sessionStorage.getItem(SECTION_KEY))
}

export function saveActiveSection(section) {
  safe(() => sessionStorage.setItem(SECTION_KEY, section))
}

// apiRequest/apiUpload avisan con este evento cuando el servidor rechaza el
// token (vencido o invalido); la app vuelve al login.
export const SESSION_EXPIRED_EVENT = 'fractal:session-expired'
