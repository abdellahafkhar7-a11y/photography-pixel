import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
const email = requireEnv('INITIAL_OWNER_EMAIL')
const password = requireEnv('INITIAL_OWNER_PASSWORD')

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

// PostgREST caches its table catalog; right after `db push` creates brand-new
// tables it may not have reloaded it yet, which makes the roles lookup fail
// for a short window. Retry instead of giving up on the first attempt.
async function findOwnerRoleId() {
  let lastError = null
  for (let attempt = 1; attempt <= ROLE_ATTEMPTS; attempt += 1) {
    const { data, error } = await service
      .from('roles')
      .select('id')
      .eq('key', 'owner')
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
    : 'The select succeeded but no "owner" row was found.'
  fail(
    `Owner role not found after ${ROLE_ATTEMPTS} attempts.\n` +
      `Connected project: ${projectHost}\n` +
      'Make sure SUPABASE_URL points to the same project where you ran: npm run db:migrate\n' +
      detail
  )
}

async function verifyOwner(userId, who) {
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
  if (role.key !== 'owner' || profile.is_active !== true) {
    fail(`Owner profile is incorrect: role=${role.key} is_active=${profile.is_active}`)
  }
  console.log(`${who}: role=owner status=active (${email})`)
}

const { data: existing, error: listError } = await service.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
})
if (listError) fail(`Could not list users: ${listError.message}`)

const existingUser = existing.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())

if (existingUser) {
  console.log('Found existing user; activating them as owner…')
  const { error: updateError } = await service.auth.admin.updateUserById(existingUser.id, {
    password,
    email_confirm: true,
  })
  if (updateError) fail(`Could not update existing user: ${updateError.message}`)
  const ownerRoleId = await findOwnerRoleId()
  const { error: profileError } = await service
    .from('app_users')
    .update({ is_active: true, role_id: ownerRoleId })
    .eq('id', existingUser.id)
  if (profileError) fail(`Could not activate profile: ${profileError.message}`)
  await verifyOwner(existingUser.id, 'Owner verified and activated')
  process.exit(0)
}

const { data: created, error: createError } = await service.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})
if (createError) fail(`Could not create owner: ${createError.message}`)

const ownerRoleId = await findOwnerRoleId()

const { error: profileError } = await service
  .from('app_users')
  .update({ is_active: true, role_id: ownerRoleId })
  .eq('id', created.user.id)
if (profileError) fail(`Could not set owner role: ${profileError.message}`)

await verifyOwner(created.user.id, 'Owner created and activated')