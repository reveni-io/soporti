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
  getReviewerSuggestions,
  setReviewerSuggestions,
  parseReviewerSuggestions,
  GITHUB_TOKEN_KEY,
  GITHUB_WEBHOOK_SECRET_KEY,
  REPO_CATALOG_KEY,
  REVIEWER_SUGGESTIONS_KEY,
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

describe('getReviewerSuggestions', () => {
  it('is off with no newcomers when nothing is stored', async () => {
    getConfigValue.mockResolvedValue(null)

    expect(await getReviewerSuggestions()).toEqual({ enabled: false, newcomers: [] })
    expect(getConfigValue).toHaveBeenCalledWith(REVIEWER_SUGGESTIONS_KEY)
  })

  it('returns the stored switch and newcomers', async () => {
    getConfigValue.mockResolvedValue({ enabled: true, newcomers: ['ana'] })

    expect(await getReviewerSuggestions()).toEqual({ enabled: true, newcomers: ['ana'] })
  })

  it('reads the new value after saving', async () => {
    getConfigValue.mockResolvedValue({ enabled: false, newcomers: [] })
    await getReviewerSuggestions()

    getConfigValue.mockResolvedValue({ enabled: true, newcomers: [] })
    const saved = await setReviewerSuggestions({ enabled: true, newcomers: [] })

    expect(saved).toEqual({ enabled: true, newcomers: [] })
    expect(setConfigValue).toHaveBeenCalledWith(REVIEWER_SUGGESTIONS_KEY, { enabled: true, newcomers: [] })
    expect((await getReviewerSuggestions()).enabled).toBe(true)
  })
})

describe('parseReviewerSuggestions', () => {
  it('keeps the switch and cleans the newcomers: no @, no blanks, no repeats', () => {
    expect(parseReviewerSuggestions({ enabled: true, newcomers: [' @ana ', '', 'Luis', 'luis', 'ANA'] })).toEqual({
      value: { enabled: true, newcomers: ['ana', 'Luis'] },
    })
  })

  it('needs a boolean switch', () => {
    expect(parseReviewerSuggestions({ enabled: 'yes', newcomers: [] })).toEqual({
      error: '"enabled" must be true or false.',
    })
    expect(parseReviewerSuggestions().error).toBe('"enabled" must be true or false.')
  })

  it('needs a list of strings', () => {
    const error = '"newcomers" must be a list of GitHub usernames.'

    expect(parseReviewerSuggestions({ enabled: true, newcomers: 'ana' })).toEqual({ error })
    expect(parseReviewerSuggestions({ enabled: true, newcomers: ['ana', 3] })).toEqual({ error })
  })

  it('rejects anything that is not a GitHub username, shortened', () => {
    expect(parseReviewerSuggestions({ enabled: true, newcomers: ['ana', 'ana garcia'] })).toEqual({
      error: '"ana garcia" is not a GitHub username.',
    })
    expect(parseReviewerSuggestions({ enabled: true, newcomers: ['x'.repeat(60)] }).error).toBe(
      `"${'x'.repeat(40)}" is not a GitHub username.`
    )
  })

  it('caps the list at 50 people', () => {
    const newcomers = Array.from({ length: 51 }, (_, index) => `dev${index}`)

    expect(parseReviewerSuggestions({ enabled: true, newcomers }).error).toBe('List at most 50 people new to the code.')
  })
})
