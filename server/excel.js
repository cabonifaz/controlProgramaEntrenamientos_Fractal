import ExcelJS from 'exceljs'

// Genera un .xlsx de plantilla: fila de encabezados en negrita + filas de
// ejemplo opcionales, para que el admin sepa exactamente que llenar.
export async function buildTemplateBuffer(sheetName, columns, sampleRows = []) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 24 }))
  sheet.getRow(1).font = { bold: true }
  sampleRows.forEach((row) => sheet.addRow(row))
  return workbook.xlsx.writeBuffer()
}

function cellToPlainValue(cell) {
  const value = cell.value
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  if (typeof value === 'object' && 'text' in value) return value.text // rich text
  if (typeof value === 'object' && 'result' in value) return value.result // formula
  return value
}

// Lee la primera hoja de un .xlsx subido y la mapea a objetos planos usando
// el texto del encabezado (no la posicion de columna) para tolerar orden
// distinto o columnas de mas.
export async function parseUploadBuffer(buffer, columns) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []

  const keyByColumnIndex = {}
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const header = String(cell.value || '').trim()
    const match = columns.find((c) => c.header === header)
    if (match) keyByColumnIndex[colNumber] = match.key
  })

  const rows = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const obj = {}
    let hasValue = false
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = keyByColumnIndex[colNumber]
      if (!key) return
      const value = cellToPlainValue(cell)
      if (value !== null && value !== '') hasValue = true
      obj[key] = value
    })
    if (hasValue) rows.push({ __row: rowNumber, ...obj })
  })
  return rows
}

// Excel puede entregar una fecha como objeto Date (celda con formato fecha)
// o como texto "2026-03-05"; normaliza a YYYY-MM-DD o null.
export function toDateString(value) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const text = String(value).trim()
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null
}

export function toTrimmedString(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}
