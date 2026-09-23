import 'dotenv/config'
import mysql from 'mysql2/promise'

// Diagnostico de migracion: usa el credential admin (MIGRATION_DB_USER),
// no el de runtime de la app -- este script hace SELECT directo sobre
// tablas para inspeccionar el esquema, algo que el usuario de la app
// (solo EXECUTE) ya no tiene permiso de hacer.
async function main() {
  const database = process.argv[2] || process.env.DB_NAME
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.MIGRATION_DB_USER || process.env.DB_USER,
    password: process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD,
    database,
  })

  const [health] = await connection.query('CALL sp_system_health()')
  console.log('sp_system_health:', health[0])

  const [[tableCount]] = await connection.query(
    'SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = DATABASE()'
  )
  console.log('tables:', tableCount.tables)

  const [[procCount]] = await connection.query(
    "SELECT COUNT(*) AS procedures FROM information_schema.routines WHERE routine_schema = DATABASE() AND routine_type = 'PROCEDURE'"
  )
  console.log('procedures:', procCount.procedures)

  const [[catalogCount]] = await connection.query('SELECT COUNT(*) AS catalogs FROM master_catalogs')
  console.log('master_catalogs:', catalogCount.catalogs)

  const [[valueCount]] = await connection.query('SELECT COUNT(*) AS values_count FROM master_catalog_values')
  console.log('master_catalog_values:', valueCount.values_count)

  const [roleValues] = await connection.query(
    "SELECT v.code, v.label FROM master_catalog_values v JOIN master_catalogs c ON c.id = v.catalog_id WHERE c.code = 'ROLE' ORDER BY v.sort_order"
  )
  console.log('ROLE values:', roleValues)

  const [[userCount]] = await connection.query('SELECT COUNT(*) AS users FROM users')
  console.log('users:', userCount.users)

  await connection.end()
}

main().catch((err) => {
  console.error('Verification failed:', err.message)
  process.exitCode = 1
})
