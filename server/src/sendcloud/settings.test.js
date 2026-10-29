import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const listSendcloudAccounts = vi.fn()
const createSendcloudAccount = vi.fn()
const deleteSendcloudAccount = vi.fn()
vi.mock('../db/sendcloud-accounts.js', () => ({
  listSendcloudAccounts,
  createSendcloudAccount,
  deleteSendcloudAccount,
}))

const {
  DUPLICATE_SENDCLOUD_ACCOUNT,
  parseSendcloudAccount,
  getSendcloudAccounts,
  describeSendcloudAccount,
  addSendcloudAccount,
  removeSendcloudAccount,
  isSendcloudConfigured,
  _resetSendcloudSettingsCacheForTests,
} = await import('./settings.js')

const CREATED_AT = new Date('2026-10-01T10:00:00Z')
const STORED = {
  id: 1,
  name: 'Acme EU',
  publicKey: 'public-key-123',
  secretKey: 'secret-key-456',
  createdAt: CREATED_AT,
}
const INPUT = { name: '  Acme US ', publicKey: ' public-key-789 ', secretKey: ' secret-key-000 ' }

beforeEach(() => {
  vi.clearAllMocks()
  _resetSendcloudSettingsCacheForTests()
  listSendcloudAccounts.mockResolvedValue([STORED])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getSendcloudAccounts', () => {
  it('caches the stored accounts for a minute', async () => {
    vi.useFakeTimers()

    expect(await getSendcloudAccounts()).toEqual([STORED])
    expect(await getSendcloudAccounts()).toEqual([STORED])
    expect(listSendcloudAccounts).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60_001)
    await getSendcloudAccounts()

    expect(listSendcloudAccounts).toHaveBeenCalledTimes(2)
  })
})

describe('describeSendcloudAccount', () => {
  it('never exposes the keys', () => {
    expect(describeSendcloudAccount(STORED)).toEqual({ id: 1, name: 'Acme EU', createdAt: CREATED_AT })
  })
})

describe('parseSendcloudAccount', () => {
  it('trims every field', () => {
    expect(parseSendcloudAccount(INPUT)).toEqual({
      value: { name: 'Acme US', publicKey: 'public-key-789', secretKey: 'secret-key-000' },
    })
  })

  it.each([
    [{ ...INPUT, name: '   ' }, 'The account name must be between 1 and 60 characters.'],
    [{ ...INPUT, name: 'x'.repeat(61) }, 'The account name must be between 1 and 60 characters.'],
    [{ ...INPUT, publicKey: 'short' }, 'That does not look like a Sendcloud public key.'],
    [{ ...INPUT, secretKey: 'has spaces inside' }, 'That does not look like a Sendcloud secret key.'],
    [{ name: 'Acme US' }, 'That does not look like a Sendcloud public key.'],
  ])('rejects %j', (input, error) => {
    expect(parseSendcloudAccount(input)).toEqual({ error })
  })

  it('rejects a missing body', () => {
    expect(parseSendcloudAccount()).toEqual({ error: 'The account name must be between 1 and 60 characters.' })
  })
})

describe('addSendcloudAccount', () => {
  const ACCOUNT = { name: 'Acme US', publicKey: 'public-key-789', secretKey: 'secret-key-000' }

  it('stores the account and drops the cached list', async () => {
    createSendcloudAccount.mockResolvedValue({ id: 2, name: 'Acme US', createdAt: CREATED_AT })
    await getSendcloudAccounts()

    const created = await addSendcloudAccount(ACCOUNT)
    await getSendcloudAccounts()

    expect(created).toEqual({ id: 2, name: 'Acme US', createdAt: CREATED_AT })
    expect(createSendcloudAccount).toHaveBeenCalledTimes(1)
    expect(createSendcloudAccount).toHaveBeenCalledWith(ACCOUNT)
    expect(listSendcloudAccounts).toHaveBeenCalledTimes(2)
  })

  it('refuses a name already in use, whatever its case', async () => {
    await expect(addSendcloudAccount({ ...ACCOUNT, name: 'acme eu' })).rejects.toMatchObject({
      code: DUPLICATE_SENDCLOUD_ACCOUNT,
      message: 'A Sendcloud account with this name already exists.',
    })
    expect(createSendcloudAccount).not.toHaveBeenCalled()
  })
})

describe('removeSendcloudAccount', () => {
  it('removes the account and drops the cached list', async () => {
    deleteSendcloudAccount.mockResolvedValue(true)
    await getSendcloudAccounts()

    expect(await removeSendcloudAccount(1)).toBe(true)
    await getSendcloudAccounts()

    expect(deleteSendcloudAccount).toHaveBeenCalledWith(1)
    expect(listSendcloudAccounts).toHaveBeenCalledTimes(2)
  })

  it('reports a missing account', async () => {
    deleteSendcloudAccount.mockResolvedValue(false)

    expect(await removeSendcloudAccount(99)).toBe(false)
  })
})

describe('isSendcloudConfigured', () => {
  it('is true once an account is linked', async () => {
    expect(await isSendcloudConfigured()).toBe(true)
  })

  it('is false without any account', async () => {
    listSendcloudAccounts.mockResolvedValue([])

    expect(await isSendcloudConfigured()).toBe(false)
  })
})
