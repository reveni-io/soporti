import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const ALLOWED_DOMAINS_KEY = 'google_allowed_domains'

export async function getAllowedDomains() {
  const stored = await getConfigValue(ALLOWED_DOMAINS_KEY)
  return Array.isArray(stored) ? stored : []
}

export async function setAllowedDomains(domains) {
  await setConfigValue(ALLOWED_DOMAINS_KEY, domains)
  return domains
}
