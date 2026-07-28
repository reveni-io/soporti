import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  getBetterstackApiToken,
  setBetterstackApiToken,
  getBetterstackConnectHost,
  setBetterstackConnectHost,
  getBetterstackUsername,
  setBetterstackUsername,
  getBetterstackPassword,
  setBetterstackPassword,
  isBetterstackConfigured,
  BETTERSTACK_API_TOKEN_KEY,
  BETTERSTACK_CONNECT_HOST_KEY,
  BETTERSTACK_USERNAME_KEY,
  BETTERSTACK_PASSWORD_KEY,
  _resetBetterstackSettingsCacheForTests,
} = await import('./settings.js')

const STORED = {
  [BETTERSTACK_API_TOKEN_KEY]: 'bs_token',
  [BETTERSTACK_CONNECT_HOST_KEY]: 'eu-nbg-2-connect.betterstackdata.com',
  [BETTERSTACK_USERNAME_KEY]: 'u1234',
  [BETTERSTACK_PASSWORD_KEY]: 'p4ssw0rd',
}

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetBetterstackSettingsCacheForTests()
})

describe('betterstack settings getters', () => {
  it('returns the stored values', async () => {
    getConfigValue.mockImplementation(async key => STORED[key] ?? null)

    expect(await getBetterstackApiToken()).toBe('bs_token')
    expect(await getBetterstackConnectHost()).toBe('eu-nbg-2-connect.betterstackdata.com')
    expect(await getBetterstackUsername()).toBe('u1234')
    expect(await getBetterstackPassword()).toBe('p4ssw0rd')
  })

  it('returns null when unset or empty', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getBetterstackApiToken()).toBeNull()

    _resetBetterstackSettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getBetterstackPassword()).toBeNull()
  })

  it('caches each value between calls', async () => {
    getConfigValue.mockImplementation(async key => STORED[key] ?? null)

    await getBetterstackApiToken()
    await getBetterstackApiToken()
    await getBetterstackUsername()
    await getBetterstackUsername()

    expect(getConfigValue).toHaveBeenCalledTimes(2)
  })
})

describe('betterstack settings setters', () => {
  it('stores each value under its own key', async () => {
    await setBetterstackApiToken('bs_token')
    await setBetterstackConnectHost('eu-nbg-2-connect.betterstackdata.com')
    await setBetterstackUsername('u1234')
    await setBetterstackPassword('p4ssw0rd')

    expect(setConfigValue).toHaveBeenCalledWith(BETTERSTACK_API_TOKEN_KEY, 'bs_token')
    expect(setConfigValue).toHaveBeenCalledWith(BETTERSTACK_CONNECT_HOST_KEY, 'eu-nbg-2-connect.betterstackdata.com')
    expect(setConfigValue).toHaveBeenCalledWith(BETTERSTACK_USERNAME_KEY, 'u1234')
    expect(setConfigValue).toHaveBeenCalledWith(BETTERSTACK_PASSWORD_KEY, 'p4ssw0rd')
  })

  it('invalidates only the saved key', async () => {
    getConfigValue.mockImplementation(async key => STORED[key] ?? null)
    expect(await getBetterstackApiToken()).toBe('bs_token')
    expect(await getBetterstackUsername()).toBe('u1234')

    await setBetterstackApiToken('rotated')

    getConfigValue.mockClear()
    getConfigValue.mockImplementation(async () => 'rotated')
    expect(await getBetterstackApiToken()).toBe('rotated')
    expect(await getBetterstackUsername()).toBe('u1234')
    expect(getConfigValue).toHaveBeenCalledTimes(1)
  })
})

describe('isBetterstackConfigured', () => {
  it('is true only when the token, host, username and password are all stored', async () => {
    getConfigValue.mockImplementation(async key => STORED[key] ?? null)
    expect(await isBetterstackConfigured()).toBe(true)

    for (const missing of Object.keys(STORED)) {
      _resetBetterstackSettingsCacheForTests()
      getConfigValue.mockImplementation(async key => (key === missing ? null : STORED[key]))
      expect(await isBetterstackConfigured()).toBe(false)
    }
  })
})
