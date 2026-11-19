import { getConfigValue, setConfigValue } from '../db/app-config.js'
import { decryptSecret, encryptSecret } from '../auth/secret-cipher.js'

export const AWS_ENABLED_KEY = 'aws_enabled'
export const AWS_REGION_KEY = 'aws_region'
export const AWS_ACCESS_KEY_ID_KEY = 'aws_access_key_id'
export const AWS_SECRET_ACCESS_KEY_KEY = 'aws_secret_access_key'

const CACHE_TTL_MS = 60_000
const ACCESS_KEY_ID_RE = /^AKIA[A-Z0-9]{16}$/
const SECRET_ACCESS_KEY_RE = /^[A-Za-z0-9/+]{40}$/
const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d{1,2}$/

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
  await setCachedValue(AWS_ACCESS_KEY_ID_KEY, accessKeyId)
  await setCachedValue(AWS_SECRET_ACCESS_KEY_KEY, secretAccessKey ? encryptSecret(secretAccessKey) : '')
}

export async function isAwsConfigured() {
  return getAwsEnabled()
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
