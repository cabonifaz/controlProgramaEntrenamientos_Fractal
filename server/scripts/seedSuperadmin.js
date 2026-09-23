import 'dotenv/config'
import { callProcedure, closePool } from '../db.js'
import { hashPassword } from '../auth.js'

async function main() {
  const email = process.env.SUPERADMIN_EMAIL
  const fullName = process.env.SUPERADMIN_NAME
  const password = process.env.SUPERADMIN_PASSWORD

  if (!email || !fullName || !password) {
    console.error('Set SUPERADMIN_EMAIL, SUPERADMIN_NAME and SUPERADMIN_PASSWORD before running this script.')
    process.exitCode = 1
    return
  }

  const passwordHash = await hashPassword(password)
  const [result] = await callProcedure('sp_bootstrap_superadmin', {
    p_email: email,
    p_full_name: fullName,
    p_password_hash: passwordHash,
  })

  if (result?.result === 'created') {
    console.log(`Superadmin created: ${email} (id ${result.user_id})`)
  } else {
    console.log('A superadmin already exists, nothing was created.')
  }
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message)
    process.exitCode = 1
  })
  .finally(() => closePool())
