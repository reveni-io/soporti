import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  getJevApiKey,
  isConfigured,
  setJevApiKey,
  getJevModelCatalog,
  setJevModelCatalog,
  JEV_API_KEY_KEY,
  JEV_MODEL_CATALOG_KEY,
  _resetJevSettingsCacheForTests,
} = await import('./settings.js')

const CATALOG = { models: [{ name: 'jev-latest', description: 'Latest', releaseDate: '2026-10-14' }], scannedAt: 'x' }

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

describe('getJevModelCatalog', () => {
  it('returns an empty catalog when nothing was scanned', async () => {
    getConfigValue.mockResolvedValue(null)

    expect(await getJevModelCatalog()).toEqual({ models: [], scannedAt: null })
  })

  it('returns the saved catalog and refreshes it after a save', async () => {
    getConfigValue.mockResolvedValue(null)
    await getJevModelCatalog()

    getConfigValue.mockResolvedValue(CATALOG)
    await setJevModelCatalog(CATALOG)

    expect(setConfigValue).toHaveBeenCalledWith(JEV_MODEL_CATALOG_KEY, CATALOG)
    expect(await getJevModelCatalog()).toEqual(CATALOG)
  })
})
