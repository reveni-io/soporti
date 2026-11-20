import { getConfigValue, setConfigValue } from '../db/app-config.js'
import { decryptSecret, encryptSecret } from '../auth/secret-cipher.js'

export const AWS_ENABLED_KEY = 'aws_enabled'
export const AWS_REGION_KEY = 'aws_region'
export const AWS_ACCESS_KEY_ID_KEY = 'aws_access_key_id'
export const AWS_SECRET_ACCESS_KEY_KEY = 'aws_secret_access_key'
export const AWS_ROLE_ARN_KEY = 'aws_role_arn'
export const AWS_ACCOUNTS_KEY = 'aws_accounts'

const CACHE_TTL_MS = 60_000
const ACCESS_KEY_ID_RE = /^AKIA[A-Z0-9]{16}$/
const SECRET_ACCESS_KEY_RE = /^[A-Za-z0-9/+]{40}$/
const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d{1,2}$/
const ROLE_ARN_RE = /^arn:aws(-[a-z]+)*:iam::\d{12}:role\/[\w+=,.@/-]{1,512}$/
const ACCOUNT_NAME_RE = /^[a-z0-9][a-z0-9-]{0,29}$/
const MAX_ACCOUNTS = 20
const ROLE_ARN_ERROR = 'That does not look like an IAM role ARN (e.g. "arn:aws:iam::123456789012:role/reader").'

const cache = new Map()

async function readTrimmed(key) {
  const stored = await getConfigValue(key)

  return typeof stored === 'string' && stored.trim().length > 0 ? stored.trim() : null
}

async function readEncrypted(key) {
  const blob = await readTrimmed(key)
  if (!blob) return null

  try {
    return decryptSecret(blob)
  } catch (err) {
    console.error(`Failed to decrypt the stored ${key}:`, err.message)
    return null
  }
}

async function readBoolean(key) {
  return (await getConfigValue(key)) === true
}

function isStoredAccount(account) {
  return typeof account?.name === 'string' && typeof account?.roleArn === 'string'
}

async function readAccounts(key) {
  const stored = await getConfigValue(key)
  if (!Array.isArray(stored)) return []

  return stored.filter(isStoredAccount).map(account => ({ name: account.name, roleArn: account.roleArn }))
}

async function getCachedValue(key, read) {
  const entry = cache.get(key)
  if (entry && entry.expiresAt > Date.now()) return entry.value

  const value = await read(key)
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

async function setCachedValue(key, value) {
  await setConfigValue(key, value)
  cache.delete(key)
}

export async function getAwsEnabled() {
  return getCachedValue(AWS_ENABLED_KEY, readBoolean)
}

export async function setAwsEnabled(enabled) {
  await setCachedValue(AWS_ENABLED_KEY, enabled)
}

export async function getAwsRegion() {
  return getCachedValue(AWS_REGION_KEY, readTrimmed)
}

export async function setAwsRegion(region) {
  await setCachedValue(AWS_REGION_KEY, region)
}

export async function getAwsAccessKey() {
  const [accessKeyId, secretAccessKey] = await Promise.all([
    getCachedValue(AWS_ACCESS_KEY_ID_KEY, readTrimmed),
    getCachedValue(AWS_SECRET_ACCESS_KEY_KEY, readEncrypted),
  ])
  if (!accessKeyId || !secretAccessKey) return null

  return { accessKeyId, secretAccessKey }
}

export async function setAwsAccessKey({ accessKeyId, secretAccessKey }) {
  const encryptedSecret = secretAccessKey ? encryptSecret(secretAccessKey) : ''

  await setCachedValue(AWS_SECRET_ACCESS_KEY_KEY, encryptedSecret)
  await setCachedValue(AWS_ACCESS_KEY_ID_KEY, accessKeyId)
}

export async function getAwsRoleArn() {
  return getCachedValue(AWS_ROLE_ARN_KEY, readTrimmed)
}

export async function setAwsRoleArn(roleArn) {
  await setCachedValue(AWS_ROLE_ARN_KEY, roleArn)
}

export async function getAwsAccounts() {
  return getCachedValue(AWS_ACCOUNTS_KEY, readAccounts)
}

export async function setAwsAccounts(accounts) {
  await setCachedValue(AWS_ACCOUNTS_KEY, accounts)
}

export async function isAwsConfigured() {
  return getAwsEnabled()
}

export function parseAwsRoleArn(value) {
  if (typeof value !== 'string') return { error: '"roleArn" must be a string (empty to use no role).' }

  const roleArn = value.trim()
  if (roleArn.length > 0 && !ROLE_ARN_RE.test(roleArn)) return { error: ROLE_ARN_ERROR }

  return { value: roleArn }
}

function parseAccount(entry) {
  const name = typeof entry?.name === 'string' ? entry.name.trim().toLowerCase() : ''
  const roleArn = typeof entry?.roleArn === 'string' ? entry.roleArn.trim() : ''

  if (!ACCOUNT_NAME_RE.test(name)) {
    return { error: `"${name}" is not a valid account name: lowercase letters, digits and dashes, up to 30.` }
  }
  if (!ROLE_ARN_RE.test(roleArn)) return { error: `${ROLE_ARN_ERROR} (account "${name}")` }

  return { value: { name, roleArn } }
}

export function parseAwsAccounts(value) {
  if (!Array.isArray(value)) return { error: '"accounts" must be a list of { name, roleArn }.' }
  if (value.length > MAX_ACCOUNTS) return { error: `At most ${MAX_ACCOUNTS} accounts can be configured.` }

  const accounts = []
  for (const entry of value) {
    const { error, value: account } = parseAccount(entry)
    if (error) return { error }
    if (accounts.some(existing => existing.name === account.name)) {
      return { error: `The account name "${account.name}" is used twice.` }
    }
    accounts.push(account)
  }

  return { value: accounts }
}

export function parseAwsRegion(value) {
  if (typeof value !== 'string') return { error: '"region" must be a string (empty to use the environment region).' }

  const region = value.trim().toLowerCase()
  if (region.length > 0 && !REGION_RE.test(region)) {
    return { error: 'That does not look like an AWS region (e.g. "eu-central-1").' }
  }

  return { value: region }
}

export function parseAwsAccessKey(body) {
  const accessKeyId = typeof body?.accessKeyId === 'string' ? body.accessKeyId.trim() : null
  const secretAccessKey = typeof body?.secretAccessKey === 'string' ? body.secretAccessKey.trim() : null

  if (accessKeyId === null || secretAccessKey === null) {
    return { error: '"accessKeyId" and "secretAccessKey" must be strings (both empty to remove the key).' }
  }
  if (!accessKeyId && !secretAccessKey) return { value: { accessKeyId: '', secretAccessKey: '' } }
  if (!ACCESS_KEY_ID_RE.test(accessKeyId)) {
    return { error: 'That does not look like a long-term AWS access key ID (it starts with "AKIA").' }
  }
  if (!SECRET_ACCESS_KEY_RE.test(secretAccessKey)) {
    return { error: 'That does not look like an AWS secret access key (40 characters).' }
  }

  return { value: { accessKeyId, secretAccessKey } }
}

export function _resetAwsSettingsCacheForTests() {
  cache.clear()
}
