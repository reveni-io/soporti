import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  getSlackBotToken,
  setSlackBotToken,
  getSlackAppToken,
  setSlackAppToken,
  getSlackSigningSecret,
  setSlackSigningSecret,
  getSlackSettings,
  isSlackConfigured,
  SLACK_BOT_TOKEN_KEY,
  SLACK_APP_TOKEN_KEY,
  SLACK_SIGNING_SECRET_KEY,
  _resetSlackSettingsCacheForTests,
} = await import('./settings.js')

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetSlackSettingsCacheForTests()
})

describe('getters', () => {
  it('return the stored value per key', async () => {
    getConfigValue.mockImplementation(async key => {
      if (key === SLACK_BOT_TOKEN_KEY) return 'xoxb-abc'
      if (key === SLACK_APP_TOKEN_KEY) return 'xapp-abc'
      if (key === SLACK_SIGNING_SECRET_KEY) return 'sign-abc'
      return null
    })

    expect(await getSlackBotToken()).toBe('xoxb-abc')
    expect(await getSlackAppToken()).toBe('xapp-abc')
    expect(await getSlackSigningSecret()).toBe('sign-abc')
  })

  it('return null when unset or empty', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getSlackBotToken()).toBeNull()

    _resetSlackSettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getSlackBotToken()).toBeNull()
  })

  it('cache each value between calls', async () => {
    getConfigValue.mockResolvedValue('xoxb-abc')

    await getSlackBotToken()
    await getSlackBotToken()

    expect(getConfigValue).toHaveBeenCalledTimes(1)
  })
})

describe('setters', () => {
  it('store each value under its key', async () => {
    await setSlackBotToken('xoxb-new')
    expect(setConfigValue).toHaveBeenCalledWith(SLACK_BOT_TOKEN_KEY, 'xoxb-new')

    await setSlackAppToken('xapp-new')
    expect(setConfigValue).toHaveBeenCalledWith(SLACK_APP_TOKEN_KEY, 'xapp-new')

    await setSlackSigningSecret('sign-new')
    expect(setConfigValue).toHaveBeenCalledWith(SLACK_SIGNING_SECRET_KEY, 'sign-new')
  })

  it('clear a value with an empty string', async () => {
    await setSlackBotToken('')
    expect(setConfigValue).toHaveBeenCalledWith(SLACK_BOT_TOKEN_KEY, '')
  })

  it('invalidate the cache so the next read reflects the save', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getSlackBotToken()).toBeNull()

    await setSlackBotToken('xoxb-new')

    getConfigValue.mockResolvedValue('xoxb-new')
    expect(await getSlackBotToken()).toBe('xoxb-new')
  })
})

describe('getSlackSettings', () => {
  it('resolves the three credentials at once', async () => {
    getConfigValue.mockImplementation(async key => {
      if (key === SLACK_BOT_TOKEN_KEY) return 'xoxb-abc'
      if (key === SLACK_APP_TOKEN_KEY) return 'xapp-abc'
      if (key === SLACK_SIGNING_SECRET_KEY) return 'sign-abc'
      return null
    })

    expect(await getSlackSettings()).toEqual({
      botToken: 'xoxb-abc',
      appToken: 'xapp-abc',
      signingSecret: 'sign-abc',
    })
  })
})

describe('isSlackConfigured', () => {
  it('is true only when both the bot and app tokens are set', async () => {
    getConfigValue.mockImplementation(async key => {
      if (key === SLACK_BOT_TOKEN_KEY) return 'xoxb-abc'
      if (key === SLACK_APP_TOKEN_KEY) return 'xapp-abc'
      return null
    })
    expect(await isSlackConfigured()).toBe(true)

    _resetSlackSettingsCacheForTests()
    getConfigValue.mockImplementation(async key => (key === SLACK_BOT_TOKEN_KEY ? 'xoxb-abc' : null))
    expect(await isSlackConfigured()).toBe(false)
  })
})
