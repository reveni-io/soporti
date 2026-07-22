import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  getHelpjuiceApiKey,
  setHelpjuiceApiKey,
  getHelpjuiceAccount,
  setHelpjuiceAccount,
  isHelpjuiceConfigured,
  HELPJUICE_API_KEY_KEY,
  HELPJUICE_ACCOUNT_KEY,
  _resetHelpjuiceSettingsCacheForTests,
} = await import('./settings.js')

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetHelpjuiceSettingsCacheForTests()
})

describe('getHelpjuiceApiKey / getHelpjuiceAccount', () => {
  it('returns the stored values', async () => {
    getConfigValue.mockImplementation(async key => (key === HELPJUICE_API_KEY_KEY ? 'hj_secret' : 'acme'))

    expect(await getHelpjuiceApiKey()).toBe('hj_secret')
    expect(await getHelpjuiceAccount()).toBe('acme')
    expect(getConfigValue).toHaveBeenCalledWith(HELPJUICE_API_KEY_KEY)
    expect(getConfigValue).toHaveBeenCalledWith(HELPJUICE_ACCOUNT_KEY)
  })

  it('returns null when unset or empty', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getHelpjuiceApiKey()).toBeNull()
    expect(await getHelpjuiceAccount()).toBeNull()

    _resetHelpjuiceSettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getHelpjuiceApiKey()).toBeNull()
    expect(await getHelpjuiceAccount()).toBeNull()
  })

  it('caches each value between calls', async () => {
    getConfigValue.mockResolvedValue('hj_secret')

    await getHelpjuiceApiKey()
    await getHelpjuiceApiKey()
    await getHelpjuiceAccount()
    await getHelpjuiceAccount()

    expect(getConfigValue).toHaveBeenCalledTimes(2)
  })
})

describe('setHelpjuiceApiKey / setHelpjuiceAccount', () => {
  it('stores the values', async () => {
    await setHelpjuiceApiKey('hj_secret')
    expect(setConfigValue).toHaveBeenCalledWith(HELPJUICE_API_KEY_KEY, 'hj_secret')

    await setHelpjuiceAccount('acme')
    expect(setConfigValue).toHaveBeenCalledWith(HELPJUICE_ACCOUNT_KEY, 'acme')
  })

  it('clears a value on an empty string', async () => {
    await setHelpjuiceApiKey('')
    expect(setConfigValue).toHaveBeenCalledWith(HELPJUICE_API_KEY_KEY, '')
  })

  it('invalidates the cache so the next read reflects the save', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getHelpjuiceApiKey()).toBeNull()

    await setHelpjuiceApiKey('hj_secret')

    getConfigValue.mockResolvedValue('hj_secret')
    expect(await getHelpjuiceApiKey()).toBe('hj_secret')
  })

  it('only invalidates the saved key, not the other one', async () => {
    getConfigValue.mockResolvedValue('acme')
    expect(await getHelpjuiceAccount()).toBe('acme')

    await setHelpjuiceApiKey('hj_secret')

    // The account read stays cached: no extra getConfigValue call.
    getConfigValue.mockClear()
    expect(await getHelpjuiceAccount()).toBe('acme')
    expect(getConfigValue).not.toHaveBeenCalled()
  })
})

describe('isHelpjuiceConfigured', () => {
  it('is true only when both the API key and the account are stored', async () => {
    getConfigValue.mockImplementation(async key => (key === HELPJUICE_API_KEY_KEY ? 'hj_secret' : 'acme'))
    expect(await isHelpjuiceConfigured()).toBe(true)

    _resetHelpjuiceSettingsCacheForTests()
    getConfigValue.mockImplementation(async key => (key === HELPJUICE_API_KEY_KEY ? 'hj_secret' : null))
    expect(await isHelpjuiceConfigured()).toBe(false)

    _resetHelpjuiceSettingsCacheForTests()
    getConfigValue.mockImplementation(async key => (key === HELPJUICE_ACCOUNT_KEY ? 'acme' : null))
    expect(await isHelpjuiceConfigured()).toBe(false)

    _resetHelpjuiceSettingsCacheForTests()
    getConfigValue.mockResolvedValue(null)
    expect(await isHelpjuiceConfigured()).toBe(false)
  })
})
