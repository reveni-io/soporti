import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const ALLOWED_DOMAINS_KEY = 'google_allowed_domains'

// Email domains allowed to sign in with Google. The database is the only
// source: the admin configures the list in the panel. No row yet (fresh
// install) or an empty list means Google sign-in is disabled (fail closed).
// No cache: a DB read per Google login is negligible and avoids stale config
// after an admin edit.
export async function getAllowedDomains() {
  const stored = await getConfigValue(ALLOWED_DOMAINS_KEY)
  return Array.isArray(stored) ? stored : []
}

export async function setAllowedDomains(domains) {
  await setConfigValue(ALLOWED_DOMAINS_KEY, domains)
  return domains
}
