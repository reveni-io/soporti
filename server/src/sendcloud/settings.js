import {
  createSendcloudAccount,
  deleteSendcloudAccount,
  listSendcloudAccounts as listStoredSendcloudAccounts,
} from '../db/sendcloud-accounts.js'

const NAME_MAX_LENGTH = 60
const KEY_RE = /^[A-Za-z0-9_-]{8,200}$/
const CACHE_TTL_MS = 60_000
const CACHE_KEY = 'accounts'
export const INVALID_SENDCLOUD_ACCOUNT = 'INVALID_SENDCLOUD_ACCOUNT'
export const DUPLICATE_SENDCLOUD_ACCOUNT = 'DUPLICATE_SENDCLOUD_ACCOUNT'

const cache = new Map()

function failure(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseSendcloudAccount({ name, publicKey, secretKey } = {}) {
  const account = { name: trimmed(name), publicKey: trimmed(publicKey), secretKey: trimmed(secretKey) }

  if (!account.name || account.name.length > NAME_MAX_LENGTH) {
    throw failure(INVALID_SENDCLOUD_ACCOUNT, `The account name must be between 1 and ${NAME_MAX_LENGTH} characters.`)
  }
  if (!KEY_RE.test(account.publicKey)) {
    throw failure(INVALID_SENDCLOUD_ACCOUNT, 'That does not look like a Sendcloud public key.')
  }
  if (!KEY_RE.test(account.secretKey)) {
    throw failure(INVALID_SENDCLOUD_ACCOUNT, 'That does not look like a Sendcloud secret key.')
  }

  return account
}

function sameName(left, right) {
  return left.toLowerCase() === right.toLowerCase()
}

export async function getSendcloudAccounts() {
  const entry = cache.get(CACHE_KEY)
  if (entry && entry.expiresAt > Date.now()) return entry.value

  const value = await listStoredSendcloudAccounts()
  cache.set(CACHE_KEY, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

export function describeSendcloudAccount({ id, name, createdAt }) {
  return { id, name, createdAt }
}

export async function addSendcloudAccount(input) {
  const account = parseSendcloudAccount(input)

  const existing = await getSendcloudAccounts()
  if (existing.some(candidate => sameName(candidate.name, account.name))) {
    throw failure(DUPLICATE_SENDCLOUD_ACCOUNT, 'A Sendcloud account with this name already exists.')
  }

  const created = await createSendcloudAccount(account)
  cache.delete(CACHE_KEY)

  return created
}

export async function removeSendcloudAccount(id) {
  const removed = await deleteSendcloudAccount(id)
  cache.delete(CACHE_KEY)

  return removed
}

export async function isSendcloudConfigured() {
  return (await getSendcloudAccounts()).length > 0
}

export function _resetSendcloudSettingsCacheForTests() {
  cache.clear()
}
