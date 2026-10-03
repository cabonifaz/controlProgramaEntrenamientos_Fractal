// Prompt para que Claude (fuera de la plataforma) disene el banner de un
// programa con la marca del tenant. El banner se sube luego en "Web
// publica": es la portada de su web y la vista previa al compartir el
// link en redes, por eso PNG/JPG y proporcion 1.91:1 (1600x840).

export const BANNER_SIZE = { width: 1600, height: 840 }

export const DEFAULT_BANNER_OPTIONS = { style: 'Moderno y tecnológico', extra: '' }
export const BANNER_STYLES = ['Moderno y tecnológico', 'Corporativo y sobrio', 'Juvenil y vibrante', 'Minimalista y elegante']

function formatDate(iso) {
  if (!iso) return null
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function buildBannerPrompt({ program, componentNames = [], tagline, audience, hasLogo }, options) {
  const o = { ...DEFAULT_BANNER_OPTIONS, ...options }
  const { width, height } = BANNER_SIZE
  const brand = program.tenant_brand_color || null
  const startsOn = formatDate(program.starts_on)
  const fileName = `banner-${String(program.public_slug || program.name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}.png`

  const short = (text, max) => (text && text.length > max ? `${text.slice(0, max).trim()}…` : text)
  const facts = [
    `Programa: ${program.name}${program.cohort ? ` (cohorte ${program.cohort})` : ''} · Organización: ${program.tenant_name}`,
    tagline ? `Frase principal: "${tagline}"` : null,
    program.description ? `Tema: ${short(program.description.trim(), 180)}` : null,
    audience ? `Público: ${short(audience.trim(), 160)}` : null,
    componentNames.length ? `Módulos (solo inspiración visual): ${componentNames.join(', ')}` : null,
  ].filter(Boolean).join('\n')

  // Breve a proposito (menos tokens) y sin asumir una IA concreta: sirve
  // tanto para IAs que generan imagenes como para las que escriben codigo.
  return `Diseña el banner promocional de un programa de formación (portada de su web e imagen al compartir el link en redes).

${facts}

Identidad visual (obligatoria):
- ${brand ? `Color de marca ${brand}: úsalo como color dominante, con tonos derivados, neutros oscuros y un acento complementario; contraste AA.` : 'Paleta sobria y profesional.'}
- ${hasLogo ? `Logo de ${program.tenant_name} (adjunto): arriba a la izquierda, sin deformarlo ni recolorearlo, sobre fondo que lo haga legible.` : `Deja un espacio libre de 280×110 px arriba a la izquierda para el logo de ${program.tenant_name}; no inventes un logo.`}
- Estilo: ${o.style}.

Contenido (poco texto, legible en miniatura de celular):
1. Nombre del programa, grande y protagonista.
2. ${tagline ? 'La frase principal.' : 'Una frase de beneficio de máx. 10 palabras.'}
3. Distintivo: ${startsOn ? `"Inicio: ${startsOn}"` : '"Preinscripciones abiertas"'}${program.modality_label ? ` · ${program.modality_label}` : ''}.
4. Un elemento visual llamativo del tema (ilustración abstracta, formas o iconos). Sin fotos de personas reales ni marcas de terceros.

Formato: imagen PNG de ${width}×${height} px (1.91:1), margen de seguridad de 80 px sin texto, menos de 5 MB, nombre ${fileName}. Si generas imágenes, créala directamente; si trabajas con código, diséñala en SVG/HTML y conviértela a PNG, comprobando que el texto se vea bien. Revisa que el texto no tenga errores de ortografía.${o.extra.trim() ? `\n\nAdemás: ${o.extra.trim()}` : ''}`
}
