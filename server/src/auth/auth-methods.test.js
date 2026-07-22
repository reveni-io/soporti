import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const { getAuthMethods, setAuthMethods, AUTH_METHODS_KEY, _resetAuthMethodsCacheForTests } =
  await import('./auth-methods.js')

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetAuthMethodsCacheForTests()
})

describe('getAuthMethods', () => {
  it('returns the stored toggles', async () => {
    getConfigValue.mockResolvedValue({ google: true, password: false })

    expect(await getAuthMethods()).toEqual({ google: true, password: false })
    expect(getConfigValue).toHaveBeenCalledWith(AUTH_METHODS_KEY)
  })

  it('defaults to Google off (fail closed) and password on when no row exists', async () => {
    getConfigValue.mockResolvedValue(null)

    expect(await getAuthMethods()).toEqual({ google: false, password: true })
  })

  it('fills malformed values with the defaults', async () => {
    getConfigValue.mockResolvedValue({ google: 'yes' })

    expect(await getAuthMethods()).toEqual({ google: false, password: true })
  })

  it('caches between reads', async () => {
    getConfigValue.mockResolvedValue({ google: true, password: true })

    await getAuthMethods()
    await getAuthMethods()

    expect(getConfigValue).toHaveBeenCalledTimes(1)
  })
})

describe('setAuthMethods', () => {
  it('persists the toggles and invalidates the cache', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getAuthMethods()).toEqual({ google: false, password: true })

    getConfigValue.mockResolvedValue({ google: true, password: true })
    const result = await setAuthMethods({ google: true, password: true })

    expect(result).toEqual({ google: true, password: true })
    expect(setConfigValue).toHaveBeenCalledWith(AUTH_METHODS_KEY, { google: true, password: true })
    expect(await getAuthMethods()).toEqual({ google: true, password: true })
  })
})
