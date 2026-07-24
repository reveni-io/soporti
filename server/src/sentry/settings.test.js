import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  getSentryToken,
  setSentryToken,
  getSentryOrg,
  setSentryOrg,
  isSentryConfigured,
  SENTRY_AUTH_TOKEN_KEY,
  SENTRY_ORG_KEY,
  _resetSentrySettingsCacheForTests,
} = await import('./settings.js')

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetSentrySettingsCacheForTests()
})

describe('getSentryToken / getSentryOrg', () => {
  it('returns the stored values', async () => {
    getConfigValue.mockImplementation(async key => (key === SENTRY_AUTH_TOKEN_KEY ? 'sntrys_secret' : 'my-org'))

    expect(await getSentryToken()).toBe('sntrys_secret')
    expect(await getSentryOrg()).toBe('my-org')
    expect(getConfigValue).toHaveBeenCalledWith(SENTRY_AUTH_TOKEN_KEY)
    expect(getConfigValue).toHaveBeenCalledWith(SENTRY_ORG_KEY)
  })

  it('returns null when unset or empty', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getSentryToken()).toBeNull()
    expect(await getSentryOrg()).toBeNull()

    _resetSentrySettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getSentryToken()).toBeNull()
    expect(await getSentryOrg()).toBeNull()
  })

  it('caches each value between calls', async () => {
    getConfigValue.mockResolvedValue('sntrys_secret')

    await getSentryToken()
    await getSentryToken()
    await getSentryOrg()
    await getSentryOrg()

    expect(getConfigValue).toHaveBeenCalledTimes(2)
  })
})

describe('setSentryToken / setSentryOrg', () => {
  it('stores the values', async () => {
    await setSentryToken('sntrys_secret')
    expect(setConfigValue).toHaveBeenCalledWith(SENTRY_AUTH_TOKEN_KEY, 'sntrys_secret')

    await setSentryOrg('my-org')
    expect(setConfigValue).toHaveBeenCalledWith(SENTRY_ORG_KEY, 'my-org')
  })

  it('clears a value on an empty string', async () => {
    await setSentryToken('')
    expect(setConfigValue).toHaveBeenCalledWith(SENTRY_AUTH_TOKEN_KEY, '')
  })

  it('invalidates the cache so the next read reflects the save', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getSentryToken()).toBeNull()

    await setSentryToken('sntrys_secret')

    getConfigValue.mockResolvedValue('sntrys_secret')
    expect(await getSentryToken()).toBe('sntrys_secret')
  })

  it('only invalidates the saved key, not the other one', async () => {
    getConfigValue.mockResolvedValue('my-org')
    expect(await getSentryOrg()).toBe('my-org')

    await setSentryToken('sntrys_secret')

    getConfigValue.mockClear()
    expect(await getSentryOrg()).toBe('my-org')
    expect(getConfigValue).not.toHaveBeenCalled()
  })
})

describe('isSentryConfigured', () => {
  it('is true only when both the auth token and the org are stored', async () => {
    getConfigValue.mockImplementation(async key => (key === SENTRY_AUTH_TOKEN_KEY ? 'sntrys_secret' : 'my-org'))
    expect(await isSentryConfigured()).toBe(true)

    _resetSentrySettingsCacheForTests()
    getConfigValue.mockImplementation(async key => (key === SENTRY_AUTH_TOKEN_KEY ? 'sntrys_secret' : null))
    expect(await isSentryConfigured()).toBe(false)

    _resetSentrySettingsCacheForTests()
    getConfigValue.mockImplementation(async key => (key === SENTRY_ORG_KEY ? 'my-org' : null))
    expect(await isSentryConfigured()).toBe(false)

    _resetSentrySettingsCacheForTests()
    getConfigValue.mockResolvedValue(null)
    expect(await isSentryConfigured()).toBe(false)
  })
})
