import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// mysql2 has no concept of the `DELIMITER` directive (it's a mysql-CLI-only
// parsing hint), so we split the file ourselves: everything before the
// DELIMITER block runs as plain semicolon-terminated statements, and the
// procedure bodies inside the block are split on `$$` instead.
async function main() {
  const filePath = path.resolve(__dirname, 'schema.sql')
  const sql = await readFile(filePath, 'utf8')

  const delimiterStart = sql.indexOf('DELIMITER $$')
  const delimiterEnd = sql.lastIndexOf('DELIMITER ;')
  if (delimiterStart === -1 || delimiterEnd === -1) {
    throw new Error('Could not locate the DELIMITER $$ / DELIMITER ; block in schema.sql')
  }

  let plainSql = sql.slice(0, delimiterStart)
  const procedureBlock = sql.slice(delimiterStart + 'DELIMITER $$'.length, delimiterEnd)
  const procedureStatements = procedureBlock.split('$$').map((s) => s.trim()).filter(Boolean)

  // schema.sql hardcodes `USE controlProgramaEntrenamientos_staging;`. Set
  // TARGET_DB to point this run at a different database (e.g. production)
  // without ever editing the committed file.
  if (process.env.TARGET_DB) {
    const before = plainSql
    plainSql = plainSql.replace(/USE\s+\w+;/, `USE ${process.env.TARGET_DB};`)
    if (plainSql === before) {
      throw new Error('TARGET_DB was set but no USE statement was found to replace')
    }
    console.log(`Targeting database: ${process.env.TARGET_DB}`)
  }

  // This is a migration (DDL) run: it uses the admin/migration credential,
  // never the app's own least-privilege runtime credential.
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.MIGRATION_DB_USER || process.env.DB_USER,
    password: process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD,
    multipleStatements: true,
  })

  try {
    console.log('Applying databases, tables and catalog seed...')
    await connection.query(plainSql)

    console.log(`Applying ${procedureStatements.length} stored procedures...`)
    for (const statement of procedureStatements) {
      const nameMatch = statement.match(/CREATE PROCEDURE (\w+)/)
      try {
        await connection.query(statement)
      } catch (err) {
        throw new Error(`Failed on ${nameMatch ? nameMatch[1] : 'unknown procedure'}: ${err.message}`)
      }
    }

    console.log('Schema applied successfully.')
  } finally {
    await connection.end()
  }
}

main().catch((err) => {
  console.error('Schema run failed:', err.message)
  process.exitCode = 1
})
