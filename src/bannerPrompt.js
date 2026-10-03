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
  const fileName = `banner-${String(program.public_slug || program.name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}.png`

  const facts = [
    `- Programa: ${program.name}${program.cohort ? ` (cohorte ${program.cohort})` : ''}`,
    `- Organización: ${program.tenant_name}`,
    tagline ? `- Frase principal: "${tagline}"` : null,
    program.description ? `- De qué trata: ${program.description.trim()}` : null,
    audience ? `- Público objetivo: ${audience.trim()}` : null,
    componentNames.length ? `- Módulos (úsalos solo como inspiración visual, no los listes todos): ${componentNames.join(', ')}` : null,
    startsOn ? `- Inicio: ${startsOn}` : null,
    program.modality_label ? `- Modalidad: ${program.modality_label}` : null,
  ].filter(Boolean).join('\n')

  return `Eres un diseñador gráfico senior. Diseña el banner promocional de un programa de formación. Se usará como portada de su web y como imagen al compartir el link en WhatsApp, LinkedIn y otras redes.

# Datos del programa
${facts}

# Identidad visual
- ${brand ? `Color principal de la marca: ${brand}. Construye la paleta a partir de él (tonos más oscuros/claros y un acento complementario) y mantén buen contraste.` : 'No hay color de marca definido: propone una paleta sobria y profesional.'}
- ${hasLogo ? `Adjunto el logo de ${program.tenant_name}: inclúyelo arriba a la izquierda, sin deformarlo ni cambiar sus colores, sobre un fondo donde se lea bien.` : `Deja libre un espacio de 280×110 px arriba a la izquierda para el logo de ${program.tenant_name} (no inventes un logo).`}
- Estilo: ${o.style}.

# Contenido del banner (poco texto: debe leerse en una miniatura de celular)
1. Nombre del programa, grande y protagonista (mínimo 80 px de alto).
2. ${tagline ? 'La frase principal' : 'Una frase corta y atractiva sobre el beneficio del programa (máx. 10 palabras)'}.
3. Un distintivo con ${startsOn ? `"Inicio: ${startsOn}"` : '"Preinscripciones abiertas"'}${program.modality_label ? ` y la modalidad (${program.modality_label})` : ''}.
4. Un elemento visual llamativo relacionado con el tema (ilustración abstracta, formas geométricas, iconografía o patrón). Sin fotos de personas reales ni marcas de terceros.

# Especificaciones técnicas
- Tamaño exacto: ${width}×${height} px (proporción 1.91:1). Deja un margen de seguridad de 80 px: ningún texto importante cerca de los bordes, porque algunas redes recortan.
- Contraste de texto AA como mínimo. Nada de texto diminuto ni párrafos.
- Diséñalo como SVG o HTML y conviértelo a PNG con tu herramienta de código (por ejemplo, cairosvg o un navegador headless). Usa fuentes disponibles en tu entorno o incrústalas, y revisa el PNG final para comprobar que el texto se ve bien.
- Entrega UN archivo PNG llamado ${fileName}, de menos de 5 MB, con su enlace de descarga.${o.extra.trim() ? `\n\n# Indicaciones adicionales\n${o.extra.trim()}` : ''}`
}
