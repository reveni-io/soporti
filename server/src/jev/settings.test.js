import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  getJevApiKey,
  isConfigured,
  setJevApiKey,
  JEV_API_KEY_KEY,
  _resetJevSettingsCacheForTests,
} = await import('./settings.js')

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetJevSettingsCacheForTests()
})

describe('getJevApiKey', () => {
  it('returns the stored key', async () => {
    getConfigValue.mockResolvedValue('jev-secret')

    expect(await getJevApiKey()).toBe('jev-secret')
    expect(getConfigValue).toHaveBeenCalledWith(JEV_API_KEY_KEY)
  })

  it('returns null when the key was removed', async () => {
    getConfigValue.mockResolvedValue('')

    expect(await getJevApiKey()).toBeNull()
  })

  it('caches the key until it is saved again', async () => {
    getConfigValue.mockResolvedValue('jev-old')
    await getJevApiKey()
    await getJevApiKey()
    expect(getConfigValue).toHaveBeenCalledTimes(1)

    getConfigValue.mockResolvedValue('jev-new')
    await setJevApiKey('jev-new')

    expect(setConfigValue).toHaveBeenCalledWith(JEV_API_KEY_KEY, 'jev-new')
    expect(await getJevApiKey()).toBe('jev-new')
    expect(getConfigValue).toHaveBeenCalledTimes(2)
  })
})

describe('isConfigured', () => {
  it('says whether a key is saved', async () => {
    getConfigValue.mockResolvedValue('jev-secret')
    expect(await isConfigured()).toBe(true)

    _resetJevSettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await isConfigured()).toBe(false)
  })
})
