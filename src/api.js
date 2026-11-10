import { SESSION_EXPIRED_EVENT } from './session'

// 401 con token = el servidor ya no acepta la sesion (vencida o invalida):
// se avisa a la app para que vuelva al login.
function notifyIfSessionRejected(response, token) {
  if (response.status === 401 && token) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
}

export async function apiRequest(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    notifyIfSessionRejected(response, token)
    throw new Error(data.message || `Request failed (${response.status})`)
  }
  return data
}

// Sin Content-Type manual: el navegador arma el boundary de multipart solo
// cuando el body es un FormData real.
export async function apiUpload(path, { token, formData } = {}) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    notifyIfSessionRejected(response, token)
    throw new Error(data.message || `Request failed (${response.status})`)
  }
  return data
}

// Descarga un archivo de un endpoint autenticado: un <a href> normal no
// puede mandar el header Authorization.
export async function apiDownload(path, { token, filename } = {}) {
  const response = await fetch(path, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  if (!response.ok) {
    notifyIfSessionRejected(response, token)
    const data = await response.json().catch(() => ({}))
    throw new Error(data.message || `Request failed (${response.status})`)
  }
  const disposition = response.headers.get('Content-Disposition') || ''
  const name = filename || disposition.match(/filename="([^"]+)"/)?.[1] || 'archivo'
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Trae un archivo privado como blob (p. ej. una imagen de evidencia): un
// <img src> normal no puede mandar el header Authorization.
export async function apiBlob(path, { token } = {}) {
  const response = await fetch(path, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  if (!response.ok) {
    notifyIfSessionRejected(response, token)
    const data = await response.json().catch(() => ({}))
    throw new Error(data.message || `Request failed (${response.status})`)
  }
  return response.blob()
}
