// Paleta de colores (principal + acento) de un programa y sus componentes.
// Se resuelve en cascada: componente -> programa -> marca del tenant. La
// usan la web publica, el material que arma la plataforma y los prompts
// (material y banner). Compartido por el servidor y el frontend.

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
export const DEFAULT_PRIMARY = '#1b6fa8'
export const DEFAULT_ACCENT = '#f0a830'

// Combinaciones sugeridas al crear un programa (contraste AA del principal
// sobre blanco y del texto blanco sobre el principal).
export const PALETTE_PRESETS = [
  { name: 'Océano', primary: '#0b5394', accent: '#f1c232' },
  { name: 'Esmeralda', primary: '#0f766e', accent: '#f59e0b' },
  { name: 'Índigo', primary: '#4338ca', accent: '#f472b6' },
  { name: 'Carbón', primary: '#1f2937', accent: '#22d3ee' },
  { name: 'Coral', primary: '#c2410c', accent: '#0ea5e9' },
  { name: 'Ciruela', primary: '#7e22ce', accent: '#facc15' },
]

const valid = (c) => (HEX_COLOR.test(c || '') ? c.toLowerCase() : null)

// source: de donde sale el principal ('component' | 'program' | 'tenant' | 'default').
export function resolvePalette({ component, program, tenantBrand } = {}) {
  const levels = [
    ['component', valid(component?.primary), valid(component?.accent)],
    ['program', valid(program?.primary), valid(program?.accent)],
  ]
  const own = levels.find(([, primary]) => primary)
  const accent = levels.map(([, , a]) => a).find(Boolean)
  if (own) return { primary: own[1], accent: accent || DEFAULT_ACCENT, source: own[0] }
  const brand = valid(tenantBrand)
  return { primary: brand || DEFAULT_PRIMARY, accent: accent || DEFAULT_ACCENT, source: brand ? 'tenant' : 'default' }
}

// Texto legible (blanco u oscuro) sobre un color de fondo, para cumplir
// contraste AA aunque la marca sea clara (amarillos, naranjas).
export function readableTextOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#14212b' : '#ffffff'
}
