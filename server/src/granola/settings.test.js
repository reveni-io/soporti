import { describe, it, expect, vi, beforeEach } from 'vitest'

const getGranolaCredential = vi.fn()
const setGranolaCredential = vi.fn()
const deleteGranolaCredential = vi.fn()
vi.mock('../db/granola-credentials.js', () => ({
  getGranolaCredential,
  setGranolaCredential,
  deleteGranolaCredential,
}))

const {
  parseGranolaApiKey,
  getGranolaApiKey,
  setGranolaApiKey,
  isGranolaConfigured,
  _resetGranolaSettingsCacheForTests,
} = await import('./settings.js')

const VALID_KEY = 'grn_dGVzdGtleTEyMzQ1Njc4OTA'

beforeEach(() => {
  vi.clearAllMocks()
  _resetGranolaSettingsCacheForTests()
})

describe('parseGranolaApiKey', () => {
  it('returns the trimmed key', () => {
    expect(parseGranolaApiKey(`  ${VALID_KEY}  `)).toBe(VALID_KEY)
  })

  it('rejects a key without the grn_ prefix', () => {
    expect(() => parseGranolaApiKey('sk-not-a-granola-key-1234567890')).toThrow(/start with "grn_"/)
  })

  it('rejects an empty or non-string value', () => {
    expect(() => parseGranolaApiKey('')).toThrow(/Granola API key/)
    expect(() => parseGranolaApiKey(null)).toThrow(/Granola API key/)
  })

  it('tags the error so the route can answer 400', () => {
    expect(() => parseGranolaApiKey('nope')).toThrow(expect.objectContaining({ code: 'INVALID_GRANOLA_API_KEY' }))
  })
})

describe('getGranolaApiKey', () => {
  it('returns the key stored for that user', async () => {
    getGranolaCredential.mockResolvedValue(VALID_KEY)

    expect(await getGranolaApiKey(7)).toBe(VALID_KEY)
    expect(getGranolaCredential).toHaveBeenCalledWith(7)
  })

  it('returns null without a user id, without touching the database', async () => {
    expect(await getGranolaApiKey(null)).toBeNull()
    expect(getGranolaCredential).not.toHaveBeenCalled()
  })

  it('returns null when the user has not connected Granola', async () => {
    getGranolaCredential.mockResolvedValue(null)
    expect(await getGranolaApiKey(7)).toBeNull()
  })

  it('caches per user without leaking one user key to another', async () => {
    getGranolaCredential.mockImplementation(async userId => (userId === 7 ? VALID_KEY : null))

    expect(await getGranolaApiKey(7)).toBe(VALID_KEY)
    expect(await getGranolaApiKey(7)).toBe(VALID_KEY)
    expect(await getGranolaApiKey(8)).toBeNull()

    expect(getGranolaCredential).toHaveBeenCalledTimes(2)
    expect(getGranolaCredential).toHaveBeenCalledWith(8)
  })
})

describe('setGranolaApiKey', () => {
  it('stores a valid key for the user and invalidates the cache', async () => {
    getGranolaCredential.mockResolvedValue(null)
    await getGranolaApiKey(7)

    expect(await setGranolaApiKey(7, VALID_KEY)).toBe(VALID_KEY)
    expect(setGranolaCredential).toHaveBeenCalledWith(7, VALID_KEY)

    getGranolaCredential.mockResolvedValue(VALID_KEY)
    expect(await getGranolaApiKey(7)).toBe(VALID_KEY)
  })

  it('deletes the credential on an empty string', async () => {
    expect(await setGranolaApiKey(7, '')).toBeNull()
    expect(deleteGranolaCredential).toHaveBeenCalledWith(7)
    expect(setGranolaCredential).not.toHaveBeenCalled()
  })

  it('rejects an invalid key without writing anything', async () => {
    await expect(setGranolaApiKey(7, 'bogus')).rejects.toThrow(/Granola API key/)
    expect(setGranolaCredential).not.toHaveBeenCalled()
  })
})

describe('isGranolaConfigured', () => {
  it('is true only when that user has a key', async () => {
    getGranolaCredential.mockImplementation(async userId => (userId === 7 ? VALID_KEY : null))

    expect(await isGranolaConfigured(7)).toBe(true)
    expect(await isGranolaConfigured(8)).toBe(false)
    expect(await isGranolaConfigured(null)).toBe(false)
  })
})
