import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
})

export async function callProcedure(name, parameters = {}) {
  const placeholders = Object.keys(parameters).map((key) => `:${key}`).join(', ')
  const [result] = await pool.query(`CALL ${name}(${placeholders})`, parameters)
  return Array.isArray(result) ? result[0] : result
}

export async function closePool() {
  await pool.end()
}

export default pool