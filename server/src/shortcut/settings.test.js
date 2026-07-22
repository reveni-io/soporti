import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  getShortcutToken,
  setShortcutToken,
  isShortcutConfigured,
  SHORTCUT_TOKEN_KEY,
  _resetShortcutSettingsCacheForTests,
} = await import('./settings.js')

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetShortcutSettingsCacheForTests()
})

describe('getShortcutToken', () => {
  it('returns the stored token', async () => {
    getConfigValue.mockResolvedValue('shortcut-token')

    expect(await getShortcutToken()).toBe('shortcut-token')
    expect(getConfigValue).toHaveBeenCalledWith(SHORTCUT_TOKEN_KEY)
  })

  it('returns null when unset or empty', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getShortcutToken()).toBeNull()

    _resetShortcutSettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getShortcutToken()).toBeNull()
  })

  it('caches the value between calls', async () => {
    getConfigValue.mockResolvedValue('shortcut-token')

    await getShortcutToken()
    await getShortcutToken()

    expect(getConfigValue).toHaveBeenCalledTimes(1)
  })
})

describe('setShortcutToken', () => {
  it('stores the token', async () => {
    await setShortcutToken('shortcut-token')
    expect(setConfigValue).toHaveBeenCalledWith(SHORTCUT_TOKEN_KEY, 'shortcut-token')
  })

  it('clears the token on an empty string', async () => {
    await setShortcutToken('')
    expect(setConfigValue).toHaveBeenCalledWith(SHORTCUT_TOKEN_KEY, '')
  })

  it('invalidates the cache so the next read reflects the save', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getShortcutToken()).toBeNull()

    await setShortcutToken('shortcut-token')

    getConfigValue.mockResolvedValue('shortcut-token')
    expect(await getShortcutToken()).toBe('shortcut-token')
  })
})

describe('isShortcutConfigured', () => {
  it('reflects whether a token is stored', async () => {
    getConfigValue.mockResolvedValue('shortcut-token')
    expect(await isShortcutConfigured()).toBe(true)

    _resetShortcutSettingsCacheForTests()
    getConfigValue.mockResolvedValue(null)
    expect(await isShortcutConfigured()).toBe(false)
  })
})
