import { getConfigValue, setConfigValue } from '../db/app-config.js'

// Google Drive service-account credential, stored in the database (app_config)
// and edited from the admin panel (Google Drive section) — no env var. The
// database is the single source of truth. The decoded, validated credential
// object is stored as jsonb; it is read on every Drive call, so it is cached
// briefly. Saves invalidate the cache immediately in this process, the TTL
// covers other instances.
//
// The credential contains a private key, so it is write-only from the admin's
// point of view (only the non-sensitive client_email is ever returned).

export const GOOGLE_DRIVE_CREDENTIALS_KEY = 'google_drive_credentials'

const CACHE_TTL_MS = 60_000
let cached = null // { value, expiresAt }

// Parse a service-account credential from either the raw JSON key or its base64
// blob (as previously held in GOOGLE_DRIVE_SA_CREDENTIALS_B64), auto-detecting
// which. Returns the validated object. Throws an error tagged with
// `code = 'INVALID_DRIVE_CREDENTIALS'` on any failure — and, deliberately, the
// message never echoes the input, which could contain the private key.
export function parseDriveCredentials(input) {
  const trimmed = typeof input === 'string' ? input.trim() : ''
  if (!trimmed) {
    const err = new Error('No credential provided.')
    err.code = 'INVALID_DRIVE_CREDENTIALS'
    throw err
  }

  let json
  // Prefer raw JSON; fall back to base64-decoding then parsing. Neither branch
  // logs or rethrows the underlying parse error (it can contain key material).
  if (trimmed.startsWith('{')) {
    try {
      json = JSON.parse(trimmed)
    } catch {
      json = null
    }
  } else {
    try {
      json = JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8'))
    } catch {
      json = null
    }
  }

  if (!json || typeof json !== 'object') {
    const err = new Error('Could not parse the credential. Paste the service-account JSON key or its base64 blob.')
    err.code = 'INVALID_DRIVE_CREDENTIALS'
    throw err
  }
  if (!json.client_email || !json.private_key) {
    const err = new Error('The credential is missing "client_email" or "private_key".')
    err.code = 'INVALID_DRIVE_CREDENTIALS'
    throw err
  }
  return json
}

// Returns the credential object, or null when not configured.
export async function getDriveCredentials() {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }
  const stored = await getConfigValue(GOOGLE_DRIVE_CREDENTIALS_KEY)
  const value = stored && typeof stored === 'object' && stored.client_email && stored.private_key ? stored : null
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

// An empty string clears the credential (Google Drive disabled). Any other
// input is parsed+validated (base64 or JSON) before being stored. Returns the
// stored credential object, or null when cleared. Logs the service-account
// email on save (parity with the previous boot-time startup signal) so admins
// can audit which account — and therefore which shared folders — is live.
export async function setDriveCredentials(input) {
  if (typeof input === 'string' && input.trim() === '') {
    await setConfigValue(GOOGLE_DRIVE_CREDENTIALS_KEY, null)
    cached = null
    console.log('[google-drive] credential cleared; integration disabled')
    return null
  }

  const creds = parseDriveCredentials(input)
  await setConfigValue(GOOGLE_DRIVE_CREDENTIALS_KEY, creds)
  cached = null
  console.log(`[google-drive] credential saved; service account: ${creds.client_email}`)
  return creds
}

// True when a credential is configured. Async because the credential lives in
// the database now (it used to be a synchronous env-derived value).
export async function isDriveConfigured() {
  return Boolean(await getDriveCredentials())
}

// Test-only: clear the cache between tests.
export function _resetDriveSettingsCacheForTests() {
  cached = null
}
