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
  INVALID_SENDCLOUD_ACCOUNT,
  DUPLICATE_SENDCLOUD_ACCOUNT,
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

describe('addSendcloudAccount', () => {
  it('stores the trimmed account and drops the cached list', async () => {
    createSendcloudAccount.mockResolvedValue({ id: 2, name: 'Acme US', createdAt: CREATED_AT })
    await getSendcloudAccounts()

    const created = await addSendcloudAccount(INPUT)
    await getSendcloudAccounts()

    expect(created).toEqual({ id: 2, name: 'Acme US', createdAt: CREATED_AT })
    expect(createSendcloudAccount).toHaveBeenCalledTimes(1)
    expect(createSendcloudAccount).toHaveBeenCalledWith({
      name: 'Acme US',
      publicKey: 'public-key-789',
      secretKey: 'secret-key-000',
    })
    expect(listSendcloudAccounts).toHaveBeenCalledTimes(2)
  })

  it.each([
    [{ ...INPUT, name: '   ' }, /account name/],
    [{ ...INPUT, name: 'x'.repeat(61) }, /account name/],
    [{ ...INPUT, publicKey: 'short' }, /public key/],
    [{ ...INPUT, secretKey: 'has spaces inside' }, /secret key/],
    [{ name: 'Acme US' }, /public key/],
  ])('rejects %j', async (input, message) => {
    await expect(addSendcloudAccount(input)).rejects.toMatchObject({ code: INVALID_SENDCLOUD_ACCOUNT })
    await expect(addSendcloudAccount(input)).rejects.toThrow(message)
    expect(createSendcloudAccount).not.toHaveBeenCalled()
  })

  it('refuses a name already in use, whatever its case', async () => {
    await expect(addSendcloudAccount({ ...INPUT, name: 'acme eu' })).rejects.toMatchObject({
      code: DUPLICATE_SENDCLOUD_ACCOUNT,
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
