import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const { getMainAgentTools, setMainAgentTools, MAIN_AGENT_TOOLS_KEY, _resetAgentSettingsCacheForTests } =
  await import('./settings.js')

describe('main agent tools', () => {
  beforeEach(() => {
    _resetAgentSettingsCacheForTests()
    getConfigValue.mockReset()
    setConfigValue.mockReset()
  })

  it('is null when nothing was ever saved, so every tool stays allowed', async () => {
    getConfigValue.mockResolvedValue(null)

    expect(await getMainAgentTools()).toBeNull()
    expect(getConfigValue).toHaveBeenCalledWith(MAIN_AGENT_TOOLS_KEY)
  })

  it('returns the stored allowlist', async () => {
    getConfigValue.mockResolvedValue(['search_code', 'get_sentry_issue'])

    expect(await getMainAgentTools()).toEqual(['search_code', 'get_sentry_issue'])
  })

  it('keeps an empty allowlist as an empty list, not as unset', async () => {
    getConfigValue.mockResolvedValue([])

    expect(await getMainAgentTools()).toEqual([])
  })

  it('ignores a stored value that is not a list', async () => {
    getConfigValue.mockResolvedValue('search_code')

    expect(await getMainAgentTools()).toBeNull()
  })

  it('reads through the cache instead of hitting the database again', async () => {
    getConfigValue.mockResolvedValue(['search_code'])

    await getMainAgentTools()
    await getMainAgentTools()

    expect(getConfigValue).toHaveBeenCalledTimes(1)
  })

  it('invalidates the cache when the allowlist is saved', async () => {
    getConfigValue.mockResolvedValue(['search_code'])
    await getMainAgentTools()

    await setMainAgentTools(['find_files'])
    getConfigValue.mockResolvedValue(['find_files'])

    expect(setConfigValue).toHaveBeenCalledWith(MAIN_AGENT_TOOLS_KEY, ['find_files'])
    expect(await getMainAgentTools()).toEqual(['find_files'])
  })
})
