import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const { getGoogleClientId, setGoogleClientId, GOOGLE_CLIENT_ID_KEY, _resetGoogleSettingsCacheForTests } =
  await import('./google-settings.js')

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetGoogleSettingsCacheForTests()
})

describe('getGoogleClientId', () => {
  it('returns the stored, trimmed client id', async () => {
    getConfigValue.mockResolvedValue('  abc.apps.googleusercontent.com  ')

    expect(await getGoogleClientId()).toBe('abc.apps.googleusercontent.com')
    expect(getConfigValue).toHaveBeenCalledWith(GOOGLE_CLIENT_ID_KEY)
  })

  it('returns null when unset or empty', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getGoogleClientId()).toBeNull()

    _resetGoogleSettingsCacheForTests()
    getConfigValue.mockResolvedValue('   ')
    expect(await getGoogleClientId()).toBeNull()
  })

  it('caches the value between calls', async () => {
    getConfigValue.mockResolvedValue('abc.apps.googleusercontent.com')

    await getGoogleClientId()
    await getGoogleClientId()

    expect(getConfigValue).toHaveBeenCalledTimes(1)
  })
})

describe('setGoogleClientId', () => {
  it('stores the value and invalidates the cache', async () => {
    getConfigValue.mockResolvedValueOnce('old.apps.googleusercontent.com')
    expect(await getGoogleClientId()).toBe('old.apps.googleusercontent.com')

    await setGoogleClientId('new.apps.googleusercontent.com')
    expect(setConfigValue).toHaveBeenCalledWith(GOOGLE_CLIENT_ID_KEY, 'new.apps.googleusercontent.com')

    getConfigValue.mockResolvedValueOnce('new.apps.googleusercontent.com')
    expect(await getGoogleClientId()).toBe('new.apps.googleusercontent.com')
    expect(getConfigValue).toHaveBeenCalledTimes(2)
  })

  it('stores an empty string to clear it', async () => {
    await setGoogleClientId('')
    expect(setConfigValue).toHaveBeenCalledWith(GOOGLE_CLIENT_ID_KEY, '')
  })
})
