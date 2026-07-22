import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  parseDriveCredentials,
  getDriveCredentials,
  setDriveCredentials,
  isDriveConfigured,
  GOOGLE_DRIVE_CREDENTIALS_KEY,
  _resetDriveSettingsCacheForTests,
} = await import('./settings.js')

const VALID = { type: 'service_account', client_email: 'sa@proj.iam.gserviceaccount.com', private_key: 'PRIVATE' }
const VALID_JSON = JSON.stringify(VALID)
const VALID_B64 = Buffer.from(VALID_JSON, 'utf8').toString('base64')

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetDriveSettingsCacheForTests()
})

describe('parseDriveCredentials', () => {
  it('parses raw JSON', () => {
    expect(parseDriveCredentials(VALID_JSON)).toEqual(VALID)
  })

  it('parses a base64 blob', () => {
    expect(parseDriveCredentials(VALID_B64)).toEqual(VALID)
  })

  it('parses base64 with surrounding whitespace', () => {
    expect(parseDriveCredentials(`\n  ${VALID_B64}  \n`)).toEqual(VALID)
  })

  it('throws INVALID_DRIVE_CREDENTIALS on unparseable input', () => {
    expect(() => parseDriveCredentials('not-json-not-base64-!!!')).toThrowError(
      expect.objectContaining({ code: 'INVALID_DRIVE_CREDENTIALS' })
    )
  })

  it('throws when client_email or private_key is missing', () => {
    expect(() => parseDriveCredentials(JSON.stringify({ client_email: 'x' }))).toThrowError(
      expect.objectContaining({ code: 'INVALID_DRIVE_CREDENTIALS' })
    )
  })

  it('throws on empty input', () => {
    expect(() => parseDriveCredentials('')).toThrowError(expect.objectContaining({ code: 'INVALID_DRIVE_CREDENTIALS' }))
  })

  it('never echoes the input in the error message', () => {
    try {
      parseDriveCredentials(JSON.stringify({ private_key: 'super-secret-key-material' }))
      throw new Error('expected to throw')
    } catch (err) {
      expect(err.message).not.toContain('super-secret-key-material')
    }
  })
})

describe('getDriveCredentials', () => {
  it('returns the stored credential object', async () => {
    getConfigValue.mockResolvedValue(VALID)

    expect(await getDriveCredentials()).toEqual(VALID)
    expect(getConfigValue).toHaveBeenCalledWith(GOOGLE_DRIVE_CREDENTIALS_KEY)
  })

  it('returns null when unset or malformed', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getDriveCredentials()).toBeNull()

    _resetDriveSettingsCacheForTests()
    getConfigValue.mockResolvedValue({ client_email: 'x' }) // missing private_key
    expect(await getDriveCredentials()).toBeNull()
  })

  it('caches the value between calls', async () => {
    getConfigValue.mockResolvedValue(VALID)

    await getDriveCredentials()
    await getDriveCredentials()

    expect(getConfigValue).toHaveBeenCalledTimes(1)
  })
})

describe('setDriveCredentials', () => {
  it('parses JSON, stores the object and returns it', async () => {
    const result = await setDriveCredentials(VALID_JSON)

    expect(result).toEqual(VALID)
    expect(setConfigValue).toHaveBeenCalledWith(GOOGLE_DRIVE_CREDENTIALS_KEY, VALID)
  })

  it('parses a base64 blob too', async () => {
    const result = await setDriveCredentials(VALID_B64)
    expect(result).toEqual(VALID)
  })

  it('clears the credential on an empty string', async () => {
    const result = await setDriveCredentials('')

    expect(result).toBeNull()
    expect(setConfigValue).toHaveBeenCalledWith(GOOGLE_DRIVE_CREDENTIALS_KEY, null)
  })

  it('throws INVALID_DRIVE_CREDENTIALS on invalid input without storing', async () => {
    await expect(setDriveCredentials('garbage')).rejects.toMatchObject({ code: 'INVALID_DRIVE_CREDENTIALS' })
    expect(setConfigValue).not.toHaveBeenCalled()
  })

  it('invalidates the cache so the next read reflects the save', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getDriveCredentials()).toBeNull()

    await setDriveCredentials(VALID_JSON)

    getConfigValue.mockResolvedValue(VALID)
    expect(await getDriveCredentials()).toEqual(VALID)
  })
})

describe('isDriveConfigured', () => {
  it('reflects whether a credential is stored', async () => {
    getConfigValue.mockResolvedValue(VALID)
    expect(await isDriveConfigured()).toBe(true)

    _resetDriveSettingsCacheForTests()
    getConfigValue.mockResolvedValue(null)
    expect(await isDriveConfigured()).toBe(false)
  })
})
