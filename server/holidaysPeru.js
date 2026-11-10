import { callProcedure } from './db.js'
import { authenticate } from './middleware/authenticate.js'
import { mapStoredProcedureError } from './errors.js'

// Feriados nacionales de Peru (calendario vigente: incluye los agregados por
// ley desde 2022: 7 de junio, 23 de julio, 6 de agosto y 9 de diciembre).
// Jueves y Viernes Santo dependen de la Pascua del año. Los dias no
// laborables que el gobierno decreta cada año se agregan a mano.
const FIXED = [
  ['01-01', 'Año Nuevo'],
  ['05-01', 'Día del Trabajo'],
  ['06-07', 'Batalla de Arica y Día de la Bandera'],
  ['06-29', 'San Pedro y San Pablo'],
  ['07-23', 'Día de la Fuerza Aérea del Perú'],
  ['07-28', 'Fiestas Patrias'],
  ['07-29', 'Fiestas Patrias'],
  ['08-06', 'Batalla de Junín'],
  ['08-30', 'Santa Rosa de Lima'],
  ['10-08', 'Combate de Angamos'],
  ['11-01', 'Día de Todos los Santos'],
  ['12-08', 'Inmaculada Concepción'],
  ['12-09', 'Batalla de Ayacucho'],
  ['12-25', 'Navidad'],
]
const RELIGIOUS = new Set(['06-29', '08-30', '11-01', '12-08', '12-25'])

// Domingo de Pascua (algoritmo gregoriano anonimo, Meeus/Jones/Butcher).
function easterSunday(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

const iso = (date) => date.toISOString().slice(0, 10)
const addDays = (date, n) => new Date(date.getTime() + n * 86400000)

export function peruHolidays(year) {
  const easter = easterSunday(year)
  return [
    ...FIXED.map(([md, name]) => ({ date: `${year}-${md}`, name, typeCode: RELIGIOUS.has(md) ? 'religious' : 'national' })),
    { date: iso(addDays(easter, -3)), name: 'Jueves Santo', typeCode: 'religious' },
    { date: iso(addDays(easter, -2)), name: 'Viernes Santo', typeCode: 'religious' },
  ].sort((x, y) => x.date.localeCompare(y.date))
}

export function registerPeruHolidayRoutes(app) {
  app.get('/api/holidays/peru/:year', authenticate, (req, res) => {
    const year = Number(req.params.year)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return res.status(400).json({ message: 'Invalid request format' })
    res.json({ data: peruHolidays(year) })
  })

  // Carga (o recarga) los feriados del año en el calendario del tenant: los
  // que ya existen en esa fecha se dejan como estan.
  app.post('/api/holidays/peru', authenticate, async (req, res) => {
    const year = Number(req.body?.year)
    const tenantId = req.body?.tenantId ?? req.user.tenantId
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(tenantId)) {
      return res.status(400).json({ message: 'Invalid request format' })
    }
    const added = []
    const existing = []
    try {
      for (const h of peruHolidays(year)) {
        try {
          await callProcedure('sp_holidays_create', {
            p_actor_user_id: req.user.id, p_actor_role: req.user.roleCode, p_actor_tenant_id: req.user.tenantId,
            p_tenant_id: tenantId, p_holiday_on: h.date, p_name: h.name, p_type_code: h.typeCode,
          })
          added.push(h)
        } catch (err) {
          if (mapStoredProcedureError(err).message !== 'holiday_already_exists') throw err
          existing.push(h)
        }
      }
      res.json({ data: { year, added, existing } })
    } catch (err) {
      const { status, message } = mapStoredProcedureError(err)
      res.status(status).json({ message })
    }
  })
}
