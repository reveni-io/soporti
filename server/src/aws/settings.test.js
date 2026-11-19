import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  AWS_ACCESS_KEY_ID_KEY,
  AWS_ENABLED_KEY,
  AWS_REGION_KEY,
  AWS_SECRET_ACCESS_KEY_KEY,
  getAwsAccessKey,
  getAwsEnabled,
  getAwsRegion,
  isAwsConfigured,
  parseAwsAccessKey,
  parseAwsRegion,
  setAwsAccessKey,
  setAwsEnabled,
  setAwsRegion,
  _resetAwsSettingsCacheForTests,
} = await import('./settings.js')

const ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE'
const SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'

let store

beforeEach(() => {
  vi.restoreAllMocks()
  _resetAwsSettingsCacheForTests()
  store = new Map()
  getConfigValue.mockReset().mockImplementation(async key => store.get(key) ?? null)
  setConfigValue.mockReset().mockImplementation(async (key, value) => {
    store.set(key, value)
  })
})

describe('getAwsEnabled', () => {
  it('is off until the switch is saved as true', async () => {
    expect(await getAwsEnabled()).toBe(false)

    await setAwsEnabled(true)

    expect(await getAwsEnabled()).toBe(true)
    expect(setConfigValue).toHaveBeenCalledWith(AWS_ENABLED_KEY, true)
  })

  it('caches the value between calls', async () => {
    store.set(AWS_ENABLED_KEY, true)

    await getAwsEnabled()
    await getAwsEnabled()

    expect(getConfigValue).toHaveBeenCalledTimes(1)
  })
})

describe('isAwsConfigured', () => {
  it('follows the switch, with no credential required', async () => {
    expect(await isAwsConfigured()).toBe(false)

    store.set(AWS_ENABLED_KEY, true)
    _resetAwsSettingsCacheForTests()

    expect(await isAwsConfigured()).toBe(true)
  })
})

describe('getAwsRegion', () => {
  it('returns the trimmed region, or null when unset or empty', async () => {
    expect(await getAwsRegion()).toBeNull()

    await setAwsRegion('  eu-central-1 ')
    expect(await getAwsRegion()).toBe('eu-central-1')

    await setAwsRegion('')
    expect(await getAwsRegion()).toBeNull()
    expect(setConfigValue).toHaveBeenLastCalledWith(AWS_REGION_KEY, '')
  })
})

describe('getAwsAccessKey', () => {
  it('stores the secret encrypted and reads the pair back in clear', async () => {
    await setAwsAccessKey({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY })

    expect(store.get(AWS_ACCESS_KEY_ID_KEY)).toBe(ACCESS_KEY_ID)
    expect(store.get(AWS_SECRET_ACCESS_KEY_KEY)).toMatch(/^v1:/)
    expect(store.get(AWS_SECRET_ACCESS_KEY_KEY)).not.toContain(SECRET_ACCESS_KEY)
    expect(await getAwsAccessKey()).toEqual({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY })
  })

  it('returns null when either half is missing', async () => {
    store.set(AWS_ACCESS_KEY_ID_KEY, ACCESS_KEY_ID)

    expect(await getAwsAccessKey()).toBeNull()
  })

  it('clears both halves with empty values', async () => {
    await setAwsAccessKey({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY })
    await setAwsAccessKey({ accessKeyId: '', secretAccessKey: '' })

    expect(store.get(AWS_ACCESS_KEY_ID_KEY)).toBe('')
    expect(store.get(AWS_SECRET_ACCESS_KEY_KEY)).toBe('')
    expect(await getAwsAccessKey()).toBeNull()
  })

  it('treats a secret that no longer decrypts as missing and logs only the key name', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    store.set(AWS_ACCESS_KEY_ID_KEY, ACCESS_KEY_ID)
    store.set(AWS_SECRET_ACCESS_KEY_KEY, 'v1:broken:blob:here')

    expect(await getAwsAccessKey()).toBeNull()
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error.mock.calls[0][0]).toBe(`Failed to decrypt the stored ${AWS_SECRET_ACCESS_KEY_KEY}:`)
  })
})

describe('parseAwsRegion', () => {
  it('accepts a region, lowercased and trimmed, and an empty value', () => {
    expect(parseAwsRegion(' EU-CENTRAL-1 ')).toEqual({ value: 'eu-central-1' })
    expect(parseAwsRegion('us-gov-west-1')).toEqual({ value: 'us-gov-west-1' })
    expect(parseAwsRegion('')).toEqual({ value: '' })
  })

  it('rejects what is not a region', () => {
    expect(parseAwsRegion('frankfurt').error).toMatch(/AWS region/)
    expect(parseAwsRegion(42).error).toMatch(/must be a string/)
  })
})

describe('parseAwsAccessKey', () => {
  it('accepts a long-term key pair', () => {
    expect(parseAwsAccessKey({ accessKeyId: ` ${ACCESS_KEY_ID} `, secretAccessKey: SECRET_ACCESS_KEY })).toEqual({
      value: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
    })
  })

  it('accepts two empty values to remove the key', () => {
    expect(parseAwsAccessKey({ accessKeyId: '', secretAccessKey: '' })).toEqual({
      value: { accessKeyId: '', secretAccessKey: '' },
    })
  })

  it('rejects missing fields, temporary keys and malformed secrets', () => {
    expect(parseAwsAccessKey({ accessKeyId: ACCESS_KEY_ID }).error).toMatch(/must be strings/)
    expect(parseAwsAccessKey(undefined).error).toMatch(/must be strings/)
    expect(
      parseAwsAccessKey({ accessKeyId: 'ASIAIOSFODNN7EXAMPLE', secretAccessKey: SECRET_ACCESS_KEY }).error
    ).toMatch(/starts with "AKIA"/)
    expect(parseAwsAccessKey({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: 'short' }).error).toMatch(/40 characters/)
    expect(parseAwsAccessKey({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: '' }).error).toMatch(/40 characters/)
  })
})
