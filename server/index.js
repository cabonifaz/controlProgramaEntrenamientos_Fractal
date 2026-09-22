import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool, { callProcedure } from './db.js'

const app = express()
const port = Number(process.env.PORT || 3000)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.use(express.json())

app.get('/api/health', async (_req, res) => {
  try {
    const data = await callProcedure('sp_system_health')
    res.json({ ok: true, data })
  } catch {
    res.status(503).json({ ok: false, message: 'Database procedure unavailable' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const data = await callProcedure('sp_authenticate_user', { p_email: req.body.email, p_password: req.body.password, p_role: req.body.role })
    res.json({ data })
  } catch {
    res.status(401).json({ message: 'Invalid credentials' })
  }
})

app.get('/api/dashboard/:role', async (req, res) => {
  try {
    const data = await callProcedure('sp_dashboard_get', { p_user_id: req.user?.id || null, p_role: req.params.role, p_tenant_id: req.user?.tenantId || null })
    res.json({ data })
  } catch {
    res.status(500).json({ message: 'Dashboard procedure unavailable' })
  }
})

app.post('/api/attendance', async (req, res) => {
  try {
    const data = await callProcedure('sp_attendance_record', { ...req.body, p_user_id: req.user?.id || null })
    res.status(201).json({ data })
  } catch {
    res.status(400).json({ message: 'Attendance could not be recorded' })
  }
})

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(__dirname, '../dist')
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(port, () => console.log(`Training monolith listening on http://localhost:${port}`))