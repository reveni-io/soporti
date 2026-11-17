import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getGoogleClientId = vi.fn()
const getGoogleClientSecret = vi.fn()
vi.mock('../auth/google-settings.js', () => ({ getGoogleClientId, getGoogleClientSecret }))

const getGoogleConnection = vi.fn()
const upsertGoogleConnection = vi.fn()
const deleteGoogleConnection = vi.fn()
vi.mock('../db/google-connections.js', () => ({ getGoogleConnection, upsertGoogleConnection, deleteGoogleConnection }))

const requestAccessToken = vi.fn()
const revokeToken = vi.fn()
vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn(function (options) {
    const client = {
      credentials: {},
      setCredentials: credentials => {
        client.credentials = credentials
      },
      getAccessToken: async () => {
        const { token, expiryDate } = await requestAccessToken(options, client.credentials.refresh_token)
        client.credentials = { ...client.credentials, access_token: token, expiry_date: expiryDate }
        return { token }
      },
      revokeToken,
    }
    return client
  }),
}))

const { encryptSecret, decryptSecret } = await import('../auth/secret-cipher.js')
const {
  isGmailConfigured,
  isGoogleCalendarConfigured,
  getGoogleAccessToken,
  invalidateGoogleAccessToken,
  describeGoogleConnection,
  saveGoogleConnection,
  removeGoogleConnection,
  disconnectGoogle,
  grantsWorkspaceAccess,
  _resetGoogleWorkspaceCacheForTests,
} = await import('./settings.js')

const NOW = 1_800_000_000_000
const CLIENT_ID = 'abc.apps.googleusercontent.com'
const CLIENT_SECRET = 'GOCSPX-secret'
const REFRESH_TOKEN = '1//0refresh-token'
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const WORKSPACE_SCOPES = ['openid', 'email', 'profile', GMAIL_SCOPE, CALENDAR_SCOPE]
const NOT_CONNECTED = 'Google is not connected. Connect it from Settings → Connections.'
const REVOKED = 'Google access was revoked. Reconnect it from Settings → Connections.'

function storedRow(scopes = `openid email ${GMAIL_SCOPE} ${CALENDAR_SCOPE}`) {
  return { email: 'jane@example.com', refreshToken: encryptSecret(REFRESH_TOKEN), scopes }
}

function invalidGrant() {
  return Object.assign(new Error('invalid_grant'), { response: { data: { error: 'invalid_grant' } } })
}

beforeEach(() => {
  vi.clearAllMocks()
  _resetGoogleWorkspaceCacheForTests()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  getGoogleClientId.mockResolvedValue(CLIENT_ID)
  getGoogleClientSecret.mockResolvedValue(CLIENT_SECRET)
  getGoogleConnection.mockResolvedValue(storedRow())
  requestAccessToken.mockResolvedValue({ token: 'access-1', expiryDate: NOW + 3_600_000 })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('grantsWorkspaceAccess', () => {
  it('is true when Gmail or Calendar was granted', () => {
    expect(grantsWorkspaceAccess(['openid', GMAIL_SCOPE])).toBe(true)
    expect(grantsWorkspaceAccess(['openid', CALENDAR_SCOPE])).toBe(true)
  })

  it('is false for a sign-in only grant', () => {
    expect(grantsWorkspaceAccess(['openid', 'email', 'profile'])).toBe(false)
  })
})

describe('isGmailConfigured', () => {
  it('is true when the client secret is set and the user granted Gmail', async () => {
    expect(await isGmailConfigured(7)).toBe(true)
    expect(getGoogleConnection).toHaveBeenCalledWith(7)
  })

  it('is false when the user only granted Calendar', async () => {
    getGoogleConnection.mockResolvedValue(storedRow(`openid ${CALENDAR_SCOPE}`))

    expect(await isGmailConfigured(7)).toBe(false)
  })

  it('is false once the client secret is removed', async () => {
    getGoogleClientSecret.mockResolvedValue(null)

    expect(await isGmailConfigured(7)).toBe(false)
  })

  it('is false when the user has no connection', async () => {
    getGoogleConnection.mockResolvedValue(null)

    expect(await isGmailConfigured(7)).toBe(false)
  })

  it('is false without a user, without touching the database', async () => {
    expect(await isGmailConfigured(null)).toBe(false)
    expect(getGoogleConnection).not.toHaveBeenCalled()
  })

  it('treats a blob it cannot decrypt as not connected and logs one line without the blob', async () => {
    const row = { ...storedRow(), refreshToken: 'v1:AAAA:BBBB:CCCC' }
    getGoogleConnection.mockResolvedValue(row)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await isGmailConfigured(7)).toBe(false)
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(row.refreshToken)
  })
})

describe('isGoogleCalendarConfigured', () => {
  it('is true when the user granted Calendar', async () => {
    getGoogleConnection.mockResolvedValue(storedRow(`openid ${CALENDAR_SCOPE}`))

    expect(await isGoogleCalendarConfigured(7)).toBe(true)
  })

  it('is false when the user only granted Gmail', async () => {
    getGoogleConnection.mockResolvedValue(storedRow(`openid ${GMAIL_SCOPE}`))

    expect(await isGoogleCalendarConfigured(7)).toBe(false)
  })
})

describe('connection cache', () => {
  it('reads each user once per minute without leaking one user into another', async () => {
    getGoogleConnection.mockImplementation(async userId => (userId === 7 ? storedRow() : null))

    expect(await isGmailConfigured(7)).toBe(true)
    expect(await isGoogleCalendarConfigured(7)).toBe(true)
    expect(await isGmailConfigured(8)).toBe(false)

    expect(getGoogleConnection).toHaveBeenCalledTimes(2)
  })

  it('reads the database again after the cache expires', async () => {
    await isGmailConfigured(7)
    Date.now.mockReturnValue(NOW + 61_000)
    await isGmailConfigured(7)

    expect(getGoogleConnection).toHaveBeenCalledTimes(2)
  })
})

describe('getGoogleAccessToken', () => {
  it('refreshes with the stored refresh token and the configured client', async () => {
    expect(await getGoogleAccessToken(7)).toBe('access-1')
    expect(requestAccessToken).toHaveBeenCalledTimes(1)
    expect(requestAccessToken).toHaveBeenCalledWith({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }, REFRESH_TOKEN)
  })

  it('reuses the access token until a minute before it expires', async () => {
    await getGoogleAccessToken(7)
    Date.now.mockReturnValue(NOW + 3_600_000 - 61_000)
    expect(await getGoogleAccessToken(7)).toBe('access-1')
    expect(requestAccessToken).toHaveBeenCalledTimes(1)

    requestAccessToken.mockResolvedValue({ token: 'access-2', expiryDate: NOW + 7_200_000 })
    Date.now.mockReturnValue(NOW + 3_600_000 - 59_000)
    expect(await getGoogleAccessToken(7)).toBe('access-2')
    expect(requestAccessToken).toHaveBeenCalledTimes(2)
  })

  it('shares one refresh between concurrent calls', async () => {
    const tokens = await Promise.all([getGoogleAccessToken(7), getGoogleAccessToken(7), getGoogleAccessToken(7)])

    expect(tokens).toEqual(['access-1', 'access-1', 'access-1'])
    expect(requestAccessToken).toHaveBeenCalledTimes(1)
  })

  it('refreshes again after the token is invalidated', async () => {
    await getGoogleAccessToken(7)
    invalidateGoogleAccessToken(7)
    requestAccessToken.mockResolvedValue({ token: 'access-2', expiryDate: NOW + 3_600_000 })

    expect(await getGoogleAccessToken(7)).toBe('access-2')
    expect(requestAccessToken).toHaveBeenCalledTimes(2)
  })

  it('throws a not-connected error when the user has no connection', async () => {
    getGoogleConnection.mockResolvedValue(null)

    await expect(getGoogleAccessToken(7)).rejects.toThrow(NOT_CONNECTED)
    expect(requestAccessToken).not.toHaveBeenCalled()
  })

  it('throws a not-connected error when the client secret is missing', async () => {
    getGoogleClientSecret.mockResolvedValue(null)

    await expect(getGoogleAccessToken(7)).rejects.toThrow(NOT_CONNECTED)
  })

  it('throws a not-connected error without a user', async () => {
    await expect(getGoogleAccessToken(undefined)).rejects.toThrow(NOT_CONNECTED)
    expect(getGoogleConnection).not.toHaveBeenCalled()
  })

  it('deletes the connection and asks to reconnect when Google revoked the grant', async () => {
    requestAccessToken.mockRejectedValue(invalidGrant())

    await expect(getGoogleAccessToken(7)).rejects.toThrow(REVOKED)
    expect(deleteGoogleConnection).toHaveBeenCalledTimes(1)
    expect(deleteGoogleConnection).toHaveBeenCalledWith(7)

    getGoogleConnection.mockResolvedValue(null)
    expect(await isGmailConfigured(7)).toBe(false)
  })

  it('throws a plain error and keeps the connection on any other failure, without logging the token', async () => {
    const failure = Object.assign(new Error('socket hang up'), { config: { data: `refresh_token=${REFRESH_TOKEN}` } })
    requestAccessToken.mockRejectedValue(failure)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const err = await getGoogleAccessToken(7).catch(error => error)

    expect(err.message).toBe('Google did not refresh the access token. Try again in a moment.')
    expect(err.config).toBeUndefined()
    expect(deleteGoogleConnection).not.toHaveBeenCalled()
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(REFRESH_TOKEN)
  })
})

describe('saveGoogleConnection', () => {
  it('stores the refresh token encrypted and the scopes space separated', async () => {
    await saveGoogleConnection(7, {
      email: 'jane@example.com',
      refreshToken: REFRESH_TOKEN,
      scopes: ['openid', GMAIL_SCOPE],
    })

    expect(upsertGoogleConnection).toHaveBeenCalledTimes(1)
    const [userId, stored] = upsertGoogleConnection.mock.calls[0]
    expect(userId).toBe(7)
    expect(stored.email).toBe('jane@example.com')
    expect(stored.scopes).toBe(`openid ${GMAIL_SCOPE}`)
    expect(stored.refreshToken).not.toContain(REFRESH_TOKEN)
    expect(decryptSecret(stored.refreshToken)).toBe(REFRESH_TOKEN)
  })

  it('seeds the access token so the next call does not refresh', async () => {
    await saveGoogleConnection(7, {
      email: 'jane@example.com',
      refreshToken: REFRESH_TOKEN,
      scopes: ['openid', GMAIL_SCOPE],
      accessToken: 'seeded-access',
      expiresAt: NOW + 3_600_000,
    })

    expect(await getGoogleAccessToken(7)).toBe('seeded-access')
    expect(requestAccessToken).not.toHaveBeenCalled()
  })

  it('drops the cached connection and access token of that user', async () => {
    getGoogleConnection.mockResolvedValue(storedRow(`openid ${CALENDAR_SCOPE}`))
    expect(await isGmailConfigured(7)).toBe(false)
    await getGoogleAccessToken(7)

    await saveGoogleConnection(7, { email: 'jane@example.com', refreshToken: REFRESH_TOKEN, scopes: [GMAIL_SCOPE] })
    getGoogleConnection.mockResolvedValue(storedRow(GMAIL_SCOPE))

    expect(await isGmailConfigured(7)).toBe(true)
    requestAccessToken.mockResolvedValue({ token: 'access-2', expiryDate: NOW + 3_600_000 })
    expect(await getGoogleAccessToken(7)).toBe('access-2')
  })
})

describe('describeGoogleConnection', () => {
  it('describes a connected user with the scopes the client should request', async () => {
    getGoogleConnection.mockResolvedValue(storedRow(`openid ${GMAIL_SCOPE}`))

    expect(await describeGoogleConnection(7)).toEqual({
      available: true,
      connected: true,
      email: 'jane@example.com',
      gmail: true,
      calendar: false,
      scopes: WORKSPACE_SCOPES,
    })
  })

  it('describes a user who has not connected Google', async () => {
    getGoogleConnection.mockResolvedValue(null)

    expect(await describeGoogleConnection(7)).toEqual({
      available: true,
      connected: false,
      email: null,
      gmail: false,
      calendar: false,
      scopes: WORKSPACE_SCOPES,
    })
  })

  it('reports Google unavailable and no scopes when the client id or secret is missing', async () => {
    getGoogleClientId.mockResolvedValue(null)
    getGoogleConnection.mockResolvedValue(null)

    expect(await describeGoogleConnection(7)).toMatchObject({ available: false, scopes: null })
  })

  it('never exposes the refresh token', async () => {
    const description = await describeGoogleConnection(7)

    expect(JSON.stringify(description)).not.toContain(REFRESH_TOKEN)
  })
})

describe('removeGoogleConnection', () => {
  it('deletes the row without revoking at Google and clears the caches', async () => {
    expect(await isGmailConfigured(7)).toBe(true)

    await removeGoogleConnection(7)
    getGoogleConnection.mockResolvedValue(null)

    expect(deleteGoogleConnection).toHaveBeenCalledWith(7)
    expect(revokeToken).not.toHaveBeenCalled()
    expect(await isGmailConfigured(7)).toBe(false)
  })
})

describe('disconnectGoogle', () => {
  it('revokes the stored refresh token at Google, then deletes the row', async () => {
    await disconnectGoogle(7)

    expect(revokeToken).toHaveBeenCalledTimes(1)
    expect(revokeToken).toHaveBeenCalledWith(REFRESH_TOKEN)
    expect(deleteGoogleConnection).toHaveBeenCalledTimes(1)
    expect(deleteGoogleConnection).toHaveBeenCalledWith(7)
  })

  it('still deletes the row when revoking fails, without logging the token', async () => {
    revokeToken.mockRejectedValue(
      Object.assign(new Error(`request to https://oauth2.googleapis.com/revoke?token=${REFRESH_TOKEN} failed`), {
        name: 'GaxiosError',
      })
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await disconnectGoogle(7)

    expect(deleteGoogleConnection).toHaveBeenCalledWith(7)
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(REFRESH_TOKEN)
  })

  it('skips the revoke when nothing is stored', async () => {
    getGoogleConnection.mockResolvedValue(null)

    await disconnectGoogle(7)

    expect(revokeToken).not.toHaveBeenCalled()
    expect(deleteGoogleConnection).toHaveBeenCalledWith(7)
  })

  it('clears the cached access token', async () => {
    await getGoogleAccessToken(7)

    await disconnectGoogle(7)
    getGoogleConnection.mockResolvedValue(null)

    await expect(getGoogleAccessToken(7)).rejects.toThrow(NOT_CONNECTED)
  })
})
