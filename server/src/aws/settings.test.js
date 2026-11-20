import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const { encryptSecret } = vi.hoisted(() => ({ encryptSecret: vi.fn() }))
vi.mock('../auth/secret-cipher.js', async importOriginal => {
  const actual = await importOriginal()
  encryptSecret.mockImplementation(actual.encryptSecret)
  return { ...actual, encryptSecret }
})

const {
  AWS_ACCESS_KEY_ID_KEY,
  AWS_ACCOUNTS_KEY,
  AWS_ENABLED_KEY,
  AWS_REGION_KEY,
  AWS_ROLE_ARN_KEY,
  AWS_SECRET_ACCESS_KEY_KEY,
  getAwsAccessKey,
  getAwsAccounts,
  getAwsEnabled,
  getAwsRegion,
  getAwsRoleArn,
  isAwsConfigured,
  parseAwsAccessKey,
  parseAwsAccounts,
  parseAwsRegion,
  parseAwsRoleArn,
  setAwsAccessKey,
  setAwsAccounts,
  setAwsEnabled,
  setAwsRegion,
  setAwsRoleArn,
  _resetAwsSettingsCacheForTests,
} = await import('./settings.js')

const ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE'
const SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
const ROLE_ARN = 'arn:aws:iam::123456789012:role/monitoring-reader'

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

  it('writes nothing when the secret cannot be encrypted, so the stored pair stays whole', async () => {
    await setAwsAccessKey({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY })
    setConfigValue.mockClear()
    encryptSecret.mockImplementationOnce(() => {
      throw new Error('cipher unavailable')
    })

    await expect(
      setAwsAccessKey({ accessKeyId: 'AKIAI44QH8DHBEXAMPLE', secretAccessKey: SECRET_ACCESS_KEY })
    ).rejects.toThrow('cipher unavailable')

    expect(setConfigValue).not.toHaveBeenCalled()
    expect(store.get(AWS_ACCESS_KEY_ID_KEY)).toBe(ACCESS_KEY_ID)
    expect(await getAwsAccessKey()).toEqual({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY })
  })

  it('writes the secret before the key ID', async () => {
    await setAwsAccessKey({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY })

    expect(setConfigValue.mock.calls.map(([key]) => key)).toEqual([AWS_SECRET_ACCESS_KEY_KEY, AWS_ACCESS_KEY_ID_KEY])
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

describe('getAwsRoleArn', () => {
  it('returns the trimmed role ARN, or null when unset or empty', async () => {
    expect(await getAwsRoleArn()).toBeNull()

    await setAwsRoleArn(` ${ROLE_ARN} `)
    expect(await getAwsRoleArn()).toBe(ROLE_ARN)

    await setAwsRoleArn('')
    expect(await getAwsRoleArn()).toBeNull()
    expect(setConfigValue).toHaveBeenLastCalledWith(AWS_ROLE_ARN_KEY, '')
  })
})

describe('getAwsAccounts', () => {
  it('returns the saved accounts in order, and an empty list when unset', async () => {
    expect(await getAwsAccounts()).toEqual([])

    await setAwsAccounts([
      { name: 'prod', roleArn: ROLE_ARN },
      { name: 'dev', roleArn: ROLE_ARN },
    ])

    expect(await getAwsAccounts()).toEqual([
      { name: 'prod', roleArn: ROLE_ARN },
      { name: 'dev', roleArn: ROLE_ARN },
    ])
  })

  it('skips stored entries that are not accounts', async () => {
    store.set(AWS_ACCOUNTS_KEY, [{ name: 'prod', roleArn: ROLE_ARN, extra: true }, { name: 'broken' }, 'x'])

    expect(await getAwsAccounts()).toEqual([{ name: 'prod', roleArn: ROLE_ARN }])
  })

  it('treats a stored value that is not a list as no accounts', async () => {
    store.set(AWS_ACCOUNTS_KEY, 'prod')

    expect(await getAwsAccounts()).toEqual([])
  })
})

describe('parseAwsRoleArn', () => {
  it('accepts a role ARN, trimmed, and an empty value', () => {
    expect(parseAwsRoleArn(` ${ROLE_ARN} `)).toEqual({ value: ROLE_ARN })
    expect(parseAwsRoleArn('arn:aws-us-gov:iam::123456789012:role/path/reader')).toEqual({
      value: 'arn:aws-us-gov:iam::123456789012:role/path/reader',
    })
    expect(parseAwsRoleArn('')).toEqual({ value: '' })
  })

  it('rejects what is not a role ARN', () => {
    expect(parseAwsRoleArn('arn:aws:iam::123456789012:user/soporti').error).toMatch(/IAM role ARN/)
    expect(parseAwsRoleArn('reader').error).toMatch(/IAM role ARN/)
    expect(parseAwsRoleArn(null).error).toMatch(/must be a string/)
  })
})

describe('parseAwsAccounts', () => {
  it('accepts a list of accounts, with lowercased names, and an empty list', () => {
    expect(parseAwsAccounts([{ name: ' Prod ', roleArn: ROLE_ARN }])).toEqual({
      value: [{ name: 'prod', roleArn: ROLE_ARN }],
    })
    expect(parseAwsAccounts([])).toEqual({ value: [] })
  })

  it('rejects bad names, bad ARNs, duplicates and lists that are too long', () => {
    expect(parseAwsAccounts('prod').error).toMatch(/must be a list/)
    expect(parseAwsAccounts([{ name: 'my prod', roleArn: ROLE_ARN }]).error).toMatch(/not a valid account name/)
    expect(parseAwsAccounts([{ name: 'prod', roleArn: 'nope' }]).error).toMatch(/IAM role ARN.*account "prod"/)
    expect(
      parseAwsAccounts([
        { name: 'prod', roleArn: ROLE_ARN },
        { name: 'PROD', roleArn: ROLE_ARN },
      ]).error
    ).toBe('The account name "prod" is used twice.')
    expect(
      parseAwsAccounts(Array.from({ length: 21 }, (_, index) => ({ name: `a${index}`, roleArn: ROLE_ARN }))).error
    ).toMatch(/At most 20/)
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
