import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  getPostgresConnection,
  setPostgresConnection,
  isPostgresConfigured,
  getPostgresMaxRows,
  setPostgresMaxRows,
  POSTGRES_CONNECTION_KEY,
  POSTGRES_MAX_ROWS_KEY,
  DEFAULT_MAX_ROWS,
  MAX_ROWS_CEILING,
  _resetPostgresSettingsCacheForTests,
} = await import('./settings.js')

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetPostgresSettingsCacheForTests()
})

describe('getPostgresConnection', () => {
  it('returns the stored connection string', async () => {
    getConfigValue.mockResolvedValue('postgresql://user:pass@host/db')

    expect(await getPostgresConnection()).toBe('postgresql://user:pass@host/db')
    expect(getConfigValue).toHaveBeenCalledWith(POSTGRES_CONNECTION_KEY)
  })

  it('returns null when unset or empty', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getPostgresConnection()).toBeNull()

    _resetPostgresSettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getPostgresConnection()).toBeNull()
  })

  it('caches the value between calls', async () => {
    getConfigValue.mockResolvedValue('postgresql://user:pass@host/db')

    await getPostgresConnection()
    await getPostgresConnection()

    expect(getConfigValue).toHaveBeenCalledTimes(1)
  })
})

describe('setPostgresConnection', () => {
  it('stores the connection string', async () => {
    await setPostgresConnection('postgresql://user:pass@host/db')
    expect(setConfigValue).toHaveBeenCalledWith(POSTGRES_CONNECTION_KEY, 'postgresql://user:pass@host/db')
  })

  it('clears the connection on an empty string', async () => {
    await setPostgresConnection('')
    expect(setConfigValue).toHaveBeenCalledWith(POSTGRES_CONNECTION_KEY, '')
  })

  it('invalidates the cache so the next read reflects the save', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getPostgresConnection()).toBeNull()

    await setPostgresConnection('postgresql://user:pass@host/db')

    getConfigValue.mockResolvedValue('postgresql://user:pass@host/db')
    expect(await getPostgresConnection()).toBe('postgresql://user:pass@host/db')
  })
})

describe('isPostgresConfigured', () => {
  it('reflects whether a connection string is stored', async () => {
    getConfigValue.mockResolvedValue('postgresql://user:pass@host/db')
    expect(await isPostgresConfigured()).toBe(true)

    _resetPostgresSettingsCacheForTests()
    getConfigValue.mockResolvedValue(null)
    expect(await isPostgresConfigured()).toBe(false)
  })
})

describe('getPostgresMaxRows', () => {
  it('returns the default when unset or invalid', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getPostgresMaxRows()).toBe(DEFAULT_MAX_ROWS)

    _resetPostgresSettingsCacheForTests()
    getConfigValue.mockResolvedValue('not-a-number')
    expect(await getPostgresMaxRows()).toBe(DEFAULT_MAX_ROWS)

    _resetPostgresSettingsCacheForTests()
    getConfigValue.mockResolvedValue(0)
    expect(await getPostgresMaxRows()).toBe(DEFAULT_MAX_ROWS)
  })

  it('returns the stored value and reads the right key', async () => {
    getConfigValue.mockResolvedValue(250)
    expect(await getPostgresMaxRows()).toBe(250)
    expect(getConfigValue).toHaveBeenCalledWith(POSTGRES_MAX_ROWS_KEY)
  })

  it('clamps to the ceiling and floors fractional values', async () => {
    getConfigValue.mockResolvedValue(999999)
    expect(await getPostgresMaxRows()).toBe(MAX_ROWS_CEILING)

    _resetPostgresSettingsCacheForTests()
    getConfigValue.mockResolvedValue(10.9)
    expect(await getPostgresMaxRows()).toBe(10)
  })
})

describe('setPostgresMaxRows', () => {
  it('stores the value and invalidates the cache', async () => {
    getConfigValue.mockResolvedValue(100)
    expect(await getPostgresMaxRows()).toBe(100)

    await setPostgresMaxRows(500)
    expect(setConfigValue).toHaveBeenCalledWith(POSTGRES_MAX_ROWS_KEY, 500)

    getConfigValue.mockResolvedValue(500)
    expect(await getPostgresMaxRows()).toBe(500)
  })

  it('clears with null (reverting to the default)', async () => {
    await setPostgresMaxRows(null)
    expect(setConfigValue).toHaveBeenCalledWith(POSTGRES_MAX_ROWS_KEY, null)

    getConfigValue.mockResolvedValue(null)
    expect(await getPostgresMaxRows()).toBe(DEFAULT_MAX_ROWS)
  })
})
