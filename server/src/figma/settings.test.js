import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  getFigmaToken,
  setFigmaToken,
  getFigmaCommentsEnabled,
  setFigmaCommentsEnabled,
  isFigmaConfigured,
  FIGMA_TOKEN_KEY,
  FIGMA_COMMENTS_KEY,
  _resetFigmaSettingsCacheForTests,
} = await import('./settings.js')

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetFigmaSettingsCacheForTests()
})

describe('getFigmaToken', () => {
  it('returns the stored token', async () => {
    getConfigValue.mockResolvedValue('figd_secret')

    expect(await getFigmaToken()).toBe('figd_secret')
    expect(getConfigValue).toHaveBeenCalledWith(FIGMA_TOKEN_KEY)
  })

  it('returns null when unset or empty', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getFigmaToken()).toBeNull()

    _resetFigmaSettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getFigmaToken()).toBeNull()
  })

  it('caches the value between calls', async () => {
    getConfigValue.mockResolvedValue('figd_secret')

    await getFigmaToken()
    await getFigmaToken()

    expect(getConfigValue).toHaveBeenCalledTimes(1)
  })
})

describe('setFigmaToken', () => {
  it('stores the token', async () => {
    await setFigmaToken('figd_secret')
    expect(setConfigValue).toHaveBeenCalledWith(FIGMA_TOKEN_KEY, 'figd_secret')
  })

  it('clears the token on an empty string', async () => {
    await setFigmaToken('')
    expect(setConfigValue).toHaveBeenCalledWith(FIGMA_TOKEN_KEY, '')
  })

  it('invalidates the cache so the next read reflects the save', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getFigmaToken()).toBeNull()

    await setFigmaToken('figd_secret')

    getConfigValue.mockResolvedValue('figd_secret')
    expect(await getFigmaToken()).toBe('figd_secret')
  })
})

describe('comment access', () => {
  it('is off until it is stored as true', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getFigmaCommentsEnabled()).toBe(false)

    _resetFigmaSettingsCacheForTests()
    getConfigValue.mockResolvedValue(true)
    expect(await getFigmaCommentsEnabled()).toBe(true)
    expect(getConfigValue).toHaveBeenCalledWith(FIGMA_COMMENTS_KEY)
  })

  it('stores the flag and invalidates its cache', async () => {
    getConfigValue.mockResolvedValue(false)
    expect(await getFigmaCommentsEnabled()).toBe(false)

    await setFigmaCommentsEnabled(true)
    expect(setConfigValue).toHaveBeenCalledWith(FIGMA_COMMENTS_KEY, true)

    getConfigValue.mockResolvedValue(true)
    expect(await getFigmaCommentsEnabled()).toBe(true)
  })
})

describe('isFigmaConfigured', () => {
  it('reflects whether a token is stored', async () => {
    getConfigValue.mockResolvedValue('figd_secret')
    expect(await isFigmaConfigured()).toBe(true)

    _resetFigmaSettingsCacheForTests()
    getConfigValue.mockResolvedValue(null)
    expect(await isFigmaConfigured()).toBe(false)
  })
})
