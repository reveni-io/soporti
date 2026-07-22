import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const { getNotionToken, setNotionToken, isNotionConfigured, NOTION_TOKEN_KEY, _resetNotionSettingsCacheForTests } =
  await import('./settings.js')

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetNotionSettingsCacheForTests()
})

describe('getNotionToken', () => {
  it('returns the stored token', async () => {
    getConfigValue.mockResolvedValue('secret_ntn_token')

    expect(await getNotionToken()).toBe('secret_ntn_token')
    expect(getConfigValue).toHaveBeenCalledWith(NOTION_TOKEN_KEY)
  })

  it('returns null when unset or empty', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getNotionToken()).toBeNull()

    _resetNotionSettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getNotionToken()).toBeNull()
  })

  it('caches the value between calls', async () => {
    getConfigValue.mockResolvedValue('secret_ntn_token')

    await getNotionToken()
    await getNotionToken()

    expect(getConfigValue).toHaveBeenCalledTimes(1)
  })
})

describe('setNotionToken', () => {
  it('stores the token', async () => {
    await setNotionToken('secret_ntn_token')
    expect(setConfigValue).toHaveBeenCalledWith(NOTION_TOKEN_KEY, 'secret_ntn_token')
  })

  it('clears the token on an empty string', async () => {
    await setNotionToken('')
    expect(setConfigValue).toHaveBeenCalledWith(NOTION_TOKEN_KEY, '')
  })

  it('invalidates the cache so the next read reflects the save', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getNotionToken()).toBeNull()

    await setNotionToken('secret_ntn_token')

    getConfigValue.mockResolvedValue('secret_ntn_token')
    expect(await getNotionToken()).toBe('secret_ntn_token')
  })
})

describe('isNotionConfigured', () => {
  it('reflects whether a token is stored', async () => {
    getConfigValue.mockResolvedValue('secret_ntn_token')
    expect(await isNotionConfigured()).toBe(true)

    _resetNotionSettingsCacheForTests()
    getConfigValue.mockResolvedValue(null)
    expect(await isNotionConfigured()).toBe(false)
  })
})
