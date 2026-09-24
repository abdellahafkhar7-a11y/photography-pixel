import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Creates or promotes an admin user to the "coordinator" role. The owner
// account (INITIAL_OWNER_EMAIL) is never touched; this script only manages a
// coordinator for RBAC testing: can create portfolio deliveries, see client
// info, generate a link and open WhatsApp — but no uploads and no team
// management.

function loadDotEnv(filePath) {
  const content = readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

const envPath = resolve(process.cwd(), '.env')
try {
  loadDotEnv(envPath)
} catch {
  // fall through to real environment variables
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required environment variable: ${name}`)
    process.exit(1)
  }
  return value
}

const url = requireEnv('SUPABASE_URL')
const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const email = requireEnv('INITIAL_COORDINATOR_EMAIL')
const password = requireEnv('INITIAL_COORDINATOR_PASSWORD')

const projectHost = new URL(url).host
console.log(`Connected to Supabase project: ${projectHost}`)

const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const sleep = (ms) => new Promise((resolveP) => setTimeout(resolveP, ms))

function fail(message) {
  console.error(`\n${message}`)
  process.exit(1)
}

const ROLE_ATTEMPTS = 5
const ROLE_RETRY_DELAY_MS = 6000

async function findRoleId(key) {
  let lastError = null
  for (let attempt = 1; attempt <= ROLE_ATTEMPTS; attempt += 1) {
    const { data, error } = await service
      .from('roles')
      .select('id')
      .eq('key', key)
      .maybeSingle()
    if (!error && data) return data.id
    lastError = error
    if (attempt < ROLE_ATTEMPTS) {
      const why = error ? error.message : 'select returned no rows yet'
      console.log(`roles lookup attempt ${attempt}/${ROLE_ATTEMPTS} failed (${why}); retrying…`)
      await sleep(ROLE_RETRY_DELAY_MS)
    }
  }
  const detail = lastError
    ? `Last error: ${lastError.message}`
    : 'The select succeeded but no matching role row was found.'
  fail(
    `Role "${key}" not found after ${ROLE_ATTEMPTS} attempts.\n` +
      `Connected project: ${projectHost}\n` +
      'Make sure SUPABASE_URL points to the same project where you ran: npm run db:migrate\n' +
      detail
  )
}

async function verifyRole(userId, expectedRole, who) {
  const { data: profile, error: profileError } = await service
    .from('app_users')
    .select('role_id, is_active')
    .eq('id', userId)
    .maybeSingle()
  if (profileError || !profile) {
    fail(`Could not read profile for verification: ${profileError ? profileError.message : 'empty result'}`)
  }
  const { data: role, error: roleError } = await service
    .from('roles')
    .select('key')
    .eq('id', profile.role_id)
    .maybeSingle()
  if (roleError || !role) {
    fail(`Could not read role for verification: ${roleError ? roleError.message : 'empty result'}`)
  }
  if (role.key !== expectedRole || profile.is_active !== true) {
    fail(`Profile is incorrect: role=${role.key} is_active=${profile.is_active}`)
  }
  console.log(`${who}: role=${expectedRole} status=active (${email})`)
}

async function main() {
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL
  if (ownerEmail && ownerEmail.toLowerCase() === email.toLowerCase()) {
    fail('This email is configured as INITIAL_OWNER_EMAIL. The coordinator script must never touch the owner account; choose a different email.')
  }

  const { data: existing, error: listError } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (listError) fail(`Could not list users: ${listError.message}`)

  const existingUser = existing.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())

  if (existingUser) {
    console.log('Found existing user; setting them up as coordinator…')
    const { error: updateError } = await service.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
    })
    if (updateError) fail(`Could not update existing user: ${updateError.message}`)
    const coordinatorRoleId = await findRoleId('coordinator')
    const { error: profileError } = await service
      .from('app_users')
      .update({ is_active: true, role_id: coordinatorRoleId })
      .eq('id', existingUser.id)
    if (profileError) fail(`Could not activate coordinator profile: ${profileError.message}`)
    await verifyRole(existingUser.id, 'coordinator', 'Coordinator verified and activated')
    return
  }

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError) fail(`Could not create coordinator: ${createError.message}`)

  const coordinatorRoleId = await findRoleId('coordinator')

  const { error: profileError } = await service
    .from('app_users')
    .update({ is_active: true, role_id: coordinatorRoleId })
    .eq('id', created.user.id)
  if (profileError) fail(`Could not set coordinator role: ${profileError.message}`)

  await verifyRole(created.user.id, 'coordinator', 'Coordinator created and activated')
}

await main()