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
  getGithubWritesEnabled,
  setGithubWritesEnabled,
  areGithubWritesEnabled,
  GITHUB_TOKEN_KEY,
  GITHUB_WEBHOOK_SECRET_KEY,
  REPO_CATALOG_KEY,
  GITHUB_WRITES_KEY,
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

describe('getGithubWritesEnabled', () => {
  it('is off unless true is stored', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getGithubWritesEnabled()).toBe(false)
    expect(getConfigValue).toHaveBeenCalledWith('github_writes_enabled')

    _resetSettingsCacheForTests()
    getConfigValue.mockResolvedValue('true')
    expect(await getGithubWritesEnabled()).toBe(false)
  })

  it('reads the new value after saving', async () => {
    getConfigValue.mockResolvedValue(false)
    expect(await getGithubWritesEnabled()).toBe(false)

    getConfigValue.mockResolvedValue(true)
    await setGithubWritesEnabled(true)

    expect(setConfigValue).toHaveBeenCalledTimes(1)
    expect(setConfigValue).toHaveBeenCalledWith(GITHUB_WRITES_KEY, true)
    expect(await getGithubWritesEnabled()).toBe(true)
  })
})

describe('areGithubWritesEnabled', () => {
  function storeValues(values) {
    getConfigValue.mockImplementation(async key => values[key] ?? null)
  }

  it('is on when a token is configured and the switch is on', async () => {
    storeValues({ [GITHUB_TOKEN_KEY]: 'ghp_stored', [GITHUB_WRITES_KEY]: true })

    expect(await areGithubWritesEnabled()).toBe(true)
  })

  it('is off when the switch is on but no token is configured', async () => {
    storeValues({ [GITHUB_TOKEN_KEY]: '', [GITHUB_WRITES_KEY]: true })

    expect(await areGithubWritesEnabled()).toBe(false)
  })

  it('is off when a token is configured but the switch is off', async () => {
    storeValues({ [GITHUB_TOKEN_KEY]: 'ghp_stored', [GITHUB_WRITES_KEY]: false })

    expect(await areGithubWritesEnabled()).toBe(false)
  })
})
