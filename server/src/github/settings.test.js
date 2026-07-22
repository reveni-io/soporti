import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  getGithubToken,
  setGithubToken,
  getWebhookSecret,
  setWebhookSecret,
  getRepoCatalog,
  setRepoCatalog,
  GITHUB_TOKEN_KEY,
  GITHUB_WEBHOOK_SECRET_KEY,
  REPO_CATALOG_KEY,
  _resetSettingsCacheForTests,
} = await import('./settings.js')

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetSettingsCacheForTests()
})

describe('getGithubToken', () => {
  it('returns the stored token', async () => {
    getConfigValue.mockResolvedValue('ghp_stored')

    expect(await getGithubToken()).toBe('ghp_stored')
    expect(getConfigValue).toHaveBeenCalledWith(GITHUB_TOKEN_KEY)
  })

  it('returns null when unset or empty', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getGithubToken()).toBeNull()

    _resetSettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getGithubToken()).toBeNull()
  })

  it('caches the value between reads', async () => {
    getConfigValue.mockResolvedValue('ghp_stored')

    await getGithubToken()
    await getGithubToken()

    expect(getConfigValue).toHaveBeenCalledTimes(1)
  })

  it('invalidates the cache when the token is saved', async () => {
    getConfigValue.mockResolvedValue('ghp_old')
    expect(await getGithubToken()).toBe('ghp_old')

    getConfigValue.mockResolvedValue('ghp_new')
    await setGithubToken('ghp_new')

    expect(await getGithubToken()).toBe('ghp_new')
    expect(setConfigValue).toHaveBeenCalledWith(GITHUB_TOKEN_KEY, 'ghp_new')
  })
})

describe('webhook secret', () => {
  it('returns the stored secret or null when unset/empty', async () => {
    getConfigValue.mockResolvedValue('hook-secret')
    expect(await getWebhookSecret()).toBe('hook-secret')
    expect(getConfigValue).toHaveBeenCalledWith(GITHUB_WEBHOOK_SECRET_KEY)

    _resetSettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getWebhookSecret()).toBeNull()
  })

  it('saves the secret and invalidates the cache', async () => {
    getConfigValue.mockResolvedValue('old-secret')
    expect(await getWebhookSecret()).toBe('old-secret')

    getConfigValue.mockResolvedValue('new-secret')
    await setWebhookSecret('new-secret')

    expect(await getWebhookSecret()).toBe('new-secret')
    expect(setConfigValue).toHaveBeenCalledWith(GITHUB_WEBHOOK_SECRET_KEY, 'new-secret')
  })
})

describe('repo catalog', () => {
  it('returns the stored catalog or an empty string', async () => {
    getConfigValue.mockResolvedValue('### org/api\nBackend.')
    expect(await getRepoCatalog()).toBe('### org/api\nBackend.')

    _resetSettingsCacheForTests()
    getConfigValue.mockResolvedValue(null)
    expect(await getRepoCatalog()).toBe('')
  })

  it('saves the catalog and invalidates the cache', async () => {
    getConfigValue.mockResolvedValue('old text')
    expect(await getRepoCatalog()).toBe('old text')

    getConfigValue.mockResolvedValue('new text')
    await setRepoCatalog('new text')

    expect(await getRepoCatalog()).toBe('new text')
    expect(setConfigValue).toHaveBeenCalledWith(REPO_CATALOG_KEY, 'new text')
  })
})
