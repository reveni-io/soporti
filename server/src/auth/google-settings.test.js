import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  getGoogleClientId,
  setGoogleClientId,
  getGoogleClientSecret,
  setGoogleClientSecret,
  GOOGLE_CLIENT_ID_KEY,
  GOOGLE_CLIENT_SECRET_KEY,
  _resetGoogleSettingsCacheForTests,
} = await import('./google-settings.js')

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

describe('Google client secret', () => {
  function useStore(initial = {}) {
    const store = new Map(Object.entries(initial))
    getConfigValue.mockImplementation(async key => store.get(key) ?? null)
    setConfigValue.mockImplementation(async (key, value) => {
      store.set(key, value)
    })
    return store
  }

  it('writes the secret encrypted and reads it back in clear', async () => {
    const store = useStore()

    await setGoogleClientSecret('GOCSPX-super-secret')

    expect(setConfigValue).toHaveBeenCalledTimes(1)
    const written = store.get(GOOGLE_CLIENT_SECRET_KEY)
    expect(written).toMatch(/^v1:/)
    expect(written).not.toContain('GOCSPX-super-secret')
    expect(await getGoogleClientSecret()).toBe('GOCSPX-super-secret')
  })

  it('returns null when unset or empty', async () => {
    useStore({ [GOOGLE_CLIENT_SECRET_KEY]: '' })

    expect(await getGoogleClientSecret()).toBeNull()
  })

  it('stores an empty string to clear it', async () => {
    const store = useStore()
    await setGoogleClientSecret('GOCSPX-super-secret')

    await setGoogleClientSecret('')

    expect(store.get(GOOGLE_CLIENT_SECRET_KEY)).toBe('')
    expect(await getGoogleClientSecret()).toBeNull()
  })

  it('reads a blob it cannot decrypt as not configured and logs one line without the blob', async () => {
    const blob = 'v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB:CCCCCCCC'
    useStore({ [GOOGLE_CLIENT_SECRET_KEY]: blob })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await getGoogleClientSecret()).toBeNull()
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(blob)

    consoleError.mockRestore()
  })

  it('caches the secret apart from the client id and refreshes only the secret on save', async () => {
    useStore({ [GOOGLE_CLIENT_ID_KEY]: 'abc' })
    await setGoogleClientSecret('old-secret')

    expect(await getGoogleClientSecret()).toBe('old-secret')
    expect(await getGoogleClientId()).toBe('abc')
    expect(await getGoogleClientSecret()).toBe('old-secret')
    expect(getConfigValue).toHaveBeenCalledTimes(2)

    await setGoogleClientSecret('new-secret')

    expect(await getGoogleClientSecret()).toBe('new-secret')
    expect(await getGoogleClientId()).toBe('abc')
    expect(getConfigValue).toHaveBeenCalledTimes(3)
  })
})
