import { describe, it, expect, vi, beforeEach } from 'vitest'

const getZendeskConnection = vi.fn()
const saveZendeskCredentials = vi.fn()
const updateZendeskOptions = vi.fn()
const deleteZendeskConnection = vi.fn()
vi.mock('../db/zendesk-connections.js', () => ({
  getZendeskConnection,
  saveZendeskCredentials,
  updateZendeskOptions,
  deleteZendeskConnection,
}))

const settings = await import('./settings.js')
const {
  INVALID_ZENDESK_CONNECTION,
  parseZendeskViewId,
  describeZendeskConnection,
  connectZendesk,
  disconnectZendesk,
  setZendeskWrites,
  setZendeskView,
  isZendeskConfigured,
  _resetZendeskSettingsCacheForTests,
} = settings

const API_TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD'
const CREDENTIALS = { subdomain: 'acme', email: 'ana@acme.com', apiToken: API_TOKEN }
const CONNECTION = { ...CREDENTIALS, writesEnabled: false, viewId: null }

beforeEach(() => {
  vi.clearAllMocks()
  _resetZendeskSettingsCacheForTests()
})

describe('parseZendeskViewId', () => {
  it('returns the numeric id, or null for an empty value', () => {
    expect(parseZendeskViewId(' 360001 ')).toBe('360001')
    expect(parseZendeskViewId('')).toBeNull()
    expect(parseZendeskViewId(null)).toBeNull()
  })

  it('rejects anything that is not a number', () => {
    expect(() => parseZendeskViewId('my-view')).toThrow(expect.objectContaining({ code: INVALID_ZENDESK_CONNECTION }))
  })
})

describe('describeZendeskConnection', () => {
  it('never exposes the API token', () => {
    expect(describeZendeskConnection({ ...CONNECTION, viewId: '42' })).toEqual({
      connected: true,
      subdomain: 'acme',
      email: 'ana@acme.com',
      writesEnabled: false,
      viewId: '42',
    })
  })

  it('describes a missing connection as disconnected', () => {
    expect(describeZendeskConnection(null)).toEqual({
      connected: false,
      subdomain: null,
      email: null,
      writesEnabled: false,
      viewId: null,
    })
  })
})

describe('getZendeskConnection', () => {
  it('returns null without a user id, without touching the database', async () => {
    expect(await settings.getZendeskConnection(null)).toBeNull()
    expect(getZendeskConnection).not.toHaveBeenCalled()
  })

  it('caches per user without leaking one connection to another user', async () => {
    getZendeskConnection.mockImplementation(async userId => (userId === 7 ? CONNECTION : null))

    expect(await settings.getZendeskConnection(7)).toEqual(CONNECTION)
    expect(await settings.getZendeskConnection(7)).toEqual(CONNECTION)
    expect(await settings.getZendeskConnection(8)).toBeNull()

    expect(getZendeskConnection).toHaveBeenCalledTimes(2)
    expect(getZendeskConnection).toHaveBeenCalledWith(8)
  })
})

describe('connectZendesk', () => {
  it('stores the trimmed credentials and returns the saved connection', async () => {
    saveZendeskCredentials.mockResolvedValue(CONNECTION)

    const connection = await connectZendesk(7, {
      subdomain: ' acme ',
      email: ' ana@acme.com ',
      apiToken: ` ${API_TOKEN} `,
    })

    expect(saveZendeskCredentials).toHaveBeenCalledTimes(1)
    expect(saveZendeskCredentials).toHaveBeenCalledWith(7, CREDENTIALS)
    expect(connection).toEqual(CONNECTION)
  })

  it('accepts the full host or url of the account as the subdomain', async () => {
    await connectZendesk(7, { ...CREDENTIALS, subdomain: 'Acme.zendesk.com' })
    await connectZendesk(7, { ...CREDENTIALS, subdomain: 'https://acme.zendesk.com/agent' })

    expect(saveZendeskCredentials).toHaveBeenNthCalledWith(1, 7, CREDENTIALS)
    expect(saveZendeskCredentials).toHaveBeenNthCalledWith(2, 7, CREDENTIALS)
  })

  it('forgets the cached connection so the next read sees the new one', async () => {
    getZendeskConnection.mockResolvedValueOnce(null).mockResolvedValueOnce(CONNECTION)
    await settings.getZendeskConnection(7)

    await connectZendesk(7, CREDENTIALS)

    expect(await settings.getZendeskConnection(7)).toEqual(CONNECTION)
  })

  it('rejects an invalid subdomain, email or token with a tagged error, without writing anything', async () => {
    await expect(connectZendesk(7, { ...CREDENTIALS, subdomain: 'not a host' })).rejects.toThrow(/subdomain/)
    await expect(connectZendesk(7, { ...CREDENTIALS, email: 'ana' })).rejects.toThrow(/email/)
    await expect(connectZendesk(7, { ...CREDENTIALS, apiToken: 'short' })).rejects.toThrow(/API token/)
    await expect(connectZendesk(7, {})).rejects.toThrow(expect.objectContaining({ code: INVALID_ZENDESK_CONNECTION }))
    expect(saveZendeskCredentials).not.toHaveBeenCalled()
  })
})

describe('disconnectZendesk', () => {
  it('deletes the connection and forgets the cached one', async () => {
    getZendeskConnection.mockResolvedValueOnce(CONNECTION)
    await settings.getZendeskConnection(7)

    await disconnectZendesk(7)
    getZendeskConnection.mockResolvedValueOnce(null)

    expect(deleteZendeskConnection).toHaveBeenCalledWith(7)
    expect(await isZendeskConfigured(7)).toBe(false)
  })
})

describe('setZendeskWrites', () => {
  it('updates the write toggle and invalidates the cache', async () => {
    getZendeskConnection.mockResolvedValueOnce(CONNECTION)
    expect((await settings.getZendeskConnection(7)).writesEnabled).toBe(false)
    updateZendeskOptions.mockResolvedValue({ ...CONNECTION, writesEnabled: true })
    getZendeskConnection.mockResolvedValueOnce({ ...CONNECTION, writesEnabled: true })

    const connection = await setZendeskWrites(7, true)

    expect(updateZendeskOptions).toHaveBeenCalledWith(7, { writesEnabled: true })
    expect(connection.writesEnabled).toBe(true)
    expect((await settings.getZendeskConnection(7)).writesEnabled).toBe(true)
  })

  it('returns null when the user is not connected', async () => {
    updateZendeskOptions.mockResolvedValue(null)

    expect(await setZendeskWrites(7, true)).toBeNull()
  })
})

describe('setZendeskView', () => {
  it('stores the parsed view id, or clears it on an empty value', async () => {
    updateZendeskOptions.mockResolvedValue(CONNECTION)

    await setZendeskView(7, ' 42 ')
    await setZendeskView(7, '')

    expect(updateZendeskOptions).toHaveBeenNthCalledWith(1, 7, { viewId: '42' })
    expect(updateZendeskOptions).toHaveBeenNthCalledWith(2, 7, { viewId: null })
  })

  it('rejects an invalid view id without writing anything', async () => {
    await expect(setZendeskView(7, 'abc')).rejects.toThrow(/view id/)
    expect(updateZendeskOptions).not.toHaveBeenCalled()
  })
})

describe('isZendeskConfigured', () => {
  it('is true only for a user with a connection', async () => {
    getZendeskConnection.mockImplementation(async userId => (userId === 7 ? CONNECTION : null))

    expect(await isZendeskConfigured(7)).toBe(true)
    expect(await isZendeskConfigured(8)).toBe(false)
    expect(await isZendeskConfigured(null)).toBe(false)
  })
})
