import 'dotenv/config'
import crypto from 'node:crypto'
import mysql from 'mysql2/promise'

// Genera un credential por entorno para que la app se conecte SOLO a llamar
// procedimientos almacenados (EXECUTE), sin poder crear/alterar/borrar
// objetos ni tocar tablas directamente. Requiere el credential de
// migracion (dev_admin) para poder crear los usuarios y otorgar el grant.
function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.randomBytes(24)
  let password = ''
  for (let i = 0; i < 24; i++) password += chars[bytes[i] % chars.length]
  return password
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.MIGRATION_DB_USER || process.env.DB_USER,
    password: process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD,
    multipleStatements: true,
  })

  const targets = [
    { user: 'app_staging', database: 'controlProgramaEntrenamientos_staging', password: generatePassword() },
    { user: 'app_production', database: 'controlProgramaEntrenamientos', password: generatePassword() },
  ]

  try {
    for (const t of targets) {
      await connection.query(
        `CREATE USER IF NOT EXISTS '${t.user}'@'%' IDENTIFIED BY '${t.password}';
         ALTER USER '${t.user}'@'%' IDENTIFIED BY '${t.password}';
         GRANT EXECUTE ON \`${t.database}\`.* TO '${t.user}'@'%';
         REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${t.user}'@'%';
         GRANT EXECUTE ON \`${t.database}\`.* TO '${t.user}'@'%';`
      )
      console.log(`${t.user} ready -> ${t.database} (EXECUTE only)`)
    }
    await connection.query('FLUSH PRIVILEGES;')

    console.log('\n--- Guarda estas credenciales, no se repiten en logs futuros ---')
    for (const t of targets) {
      console.log(`${t.user}: DB_USER=${t.user} DB_PASSWORD=${t.password} DB_NAME=${t.database}`)
    }
  } finally {
    await connection.end()
  }
}

main().catch((err) => {
  console.error('Could not create app users:', err.message)
  process.exitCode = 1
})
