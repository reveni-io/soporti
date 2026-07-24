import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const GOOGLE_DRIVE_CREDENTIALS_KEY = 'google_drive_credentials'

const CACHE_TTL_MS = 60_000
let cached = null

export function parseDriveCredentials(input) {
  const trimmed = typeof input === 'string' ? input.trim() : ''
  if (!trimmed) {
    const err = new Error('No credential provided.')
    err.code = 'INVALID_DRIVE_CREDENTIALS'
    throw err
  }

  let json
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

export async function getDriveCredentials() {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }
  const stored = await getConfigValue(GOOGLE_DRIVE_CREDENTIALS_KEY)
  const value = stored && typeof stored === 'object' && stored.client_email && stored.private_key ? stored : null
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

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

export async function isDriveConfigured() {
  return Boolean(await getDriveCredentials())
}

export function _resetDriveSettingsCacheForTests() {
  cached = null
}
