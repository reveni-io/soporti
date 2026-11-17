import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyIdToken = vi.fn()
const getToken = vi.fn()
const getAllowedDomains = vi.fn()
const getAuthMethods = vi.fn()
const getGoogleClientId = vi.fn()
const getGoogleClientSecret = vi.fn()

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn(function () {
    return { verifyIdToken, getToken }
  }),
}))
vi.mock('./allowed-domains.js', () => ({ getAllowedDomains }))
vi.mock('./auth-methods.js', () => ({ getAuthMethods }))
vi.mock('./google-settings.js', () => ({ getGoogleClientId, getGoogleClientSecret }))

const { OAuth2Client } = await import('google-auth-library')
const { verifyGoogleCredential, exchangeGoogleCode, INVALID_GOOGLE_CODE } = await import('./google.js')

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com'
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

function ticket(payload) {
  return { getPayload: () => payload }
}

beforeEach(() => {
  verifyIdToken.mockReset()
  getAllowedDomains.mockReset()
  getAllowedDomains.mockResolvedValue(['example.com'])
  getAuthMethods.mockReset()
  getAuthMethods.mockResolvedValue({ google: true, password: true })
  getGoogleClientId.mockReset()
  getGoogleClientId.mockResolvedValue(CLIENT_ID)
  getGoogleClientSecret.mockReset()
  getGoogleClientSecret.mockResolvedValue('GOCSPX-secret')
  getToken.mockReset()
  OAuth2Client.mockClear()
})

describe('verifyGoogleCredential', () => {
  it('returns the normalized profile for a valid example.com account', async () => {
    verifyIdToken.mockResolvedValue(
      ticket({ sub: '123', email: 'jane@example.com', email_verified: true, name: 'Jane', picture: 'p.png' })
    )

    const profile = await verifyGoogleCredential('tok')

    expect(profile).toEqual({ googleId: '123', email: 'jane@example.com', name: 'Jane', picture: 'p.png' })
  })

  it('accepts any domain in the allowed list', async () => {
    getAllowedDomains.mockResolvedValue(['example.com', 'example.com'])
    verifyIdToken.mockResolvedValue(ticket({ sub: '123', email: 'joe@example.com', email_verified: true }))

    const profile = await verifyGoogleCredential('tok')

    expect(profile.email).toBe('joe@example.com')
  })

  it('rejects accounts outside the allowed domains', async () => {
    verifyIdToken.mockResolvedValue(ticket({ sub: '123', email: 'jane@gmail.com', email_verified: true }))

    await expect(verifyGoogleCredential('tok')).rejects.toMatchObject({ code: 'DOMAIN_NOT_ALLOWED' })
  })

  it('matches domains case-insensitively', async () => {
    getAllowedDomains.mockResolvedValue(['Example.COM'])
    verifyIdToken.mockResolvedValue(ticket({ sub: '123', email: 'jane@example.com', email_verified: true }))

    await expect(verifyGoogleCredential('tok')).resolves.toBeTruthy()
  })

  it('allows any verified account when the domain list is empty (no restriction)', async () => {
    getAllowedDomains.mockResolvedValue([])
    verifyIdToken.mockResolvedValue(ticket({ sub: '123', email: 'anyone@gmail.com', email_verified: true }))

    const profile = await verifyGoogleCredential('tok')

    expect(profile.email).toBe('anyone@gmail.com')
  })

  it('rejects every account when the Google method is toggled off', async () => {
    getAuthMethods.mockResolvedValue({ google: false, password: true })
    verifyIdToken.mockResolvedValue(ticket({ sub: '123', email: 'jane@example.com', email_verified: true }))

    await expect(verifyGoogleCredential('tok')).rejects.toMatchObject({
      code: 'DOMAIN_NOT_ALLOWED',
      message: expect.stringContaining('disabled'),
    })
  })

  it('rejects unverified emails', async () => {
    verifyIdToken.mockResolvedValue(ticket({ sub: '123', email: 'jane@example.com', email_verified: false }))

    await expect(verifyGoogleCredential('tok')).rejects.toThrow(/Unverified/)
  })

  it('rejects when no Google client id is configured', async () => {
    getGoogleClientId.mockResolvedValue(null)

    await expect(verifyGoogleCredential('tok')).rejects.toMatchObject({
      code: 'DOMAIN_NOT_ALLOWED',
      message: expect.stringContaining('not configured'),
    })
    expect(verifyIdToken).not.toHaveBeenCalled()
  })
})

describe('exchangeGoogleCode', () => {
  function grantedTokens(overrides = {}) {
    return {
      tokens: {
        id_token: 'id-token',
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expiry_date: 1_900_000_000_000,
        scope: `openid email ${GMAIL_SCOPE} ${CALENDAR_SCOPE}`,
        ...overrides,
      },
    }
  }

  it('exchanges the code with the client secret and returns the verified profile and tokens', async () => {
    getToken.mockResolvedValue(grantedTokens())
    verifyIdToken.mockResolvedValue(
      ticket({ sub: '123', email: 'jane@example.com', email_verified: true, name: 'Jane' })
    )

    const result = await exchangeGoogleCode('auth-code')

    expect(OAuth2Client).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      clientSecret: 'GOCSPX-secret',
      redirectUri: 'postmessage',
    })
    expect(getToken).toHaveBeenCalledTimes(1)
    expect(getToken).toHaveBeenCalledWith('auth-code')
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'id-token', audience: CLIENT_ID })
    expect(result).toEqual({
      profile: { googleId: '123', email: 'jane@example.com', name: 'Jane', picture: null },
      tokens: {
        refreshToken: 'refresh-token',
        accessToken: 'access-token',
        expiresAt: 1_900_000_000_000,
        scopes: ['openid', 'email', GMAIL_SCOPE, CALENDAR_SCOPE],
      },
    })
  })

  it('returns a null refresh token and empty scopes when Google sends neither', async () => {
    getToken.mockResolvedValue(grantedTokens({ refresh_token: undefined, scope: undefined }))
    verifyIdToken.mockResolvedValue(ticket({ sub: '123', email: 'jane@example.com', email_verified: true }))

    const { tokens } = await exchangeGoogleCode('auth-code')

    expect(tokens.refreshToken).toBeNull()
    expect(tokens.scopes).toEqual([])
  })

  it('applies the allowed-domain policy when signing in', async () => {
    getToken.mockResolvedValue(grantedTokens())
    verifyIdToken.mockResolvedValue(ticket({ sub: '123', email: 'jane@gmail.com', email_verified: true }))

    await expect(exchangeGoogleCode('auth-code')).rejects.toMatchObject({ code: 'DOMAIN_NOT_ALLOWED' })
  })

  it('skips the sign-in policy when asked, for a user who is already signed in', async () => {
    getAuthMethods.mockResolvedValue({ google: false, password: true })
    getToken.mockResolvedValue(grantedTokens())
    verifyIdToken.mockResolvedValue(ticket({ sub: '123', email: 'jane@gmail.com', email_verified: true }))

    const { profile } = await exchangeGoogleCode('auth-code', { enforceSignInPolicy: false })

    expect(profile.email).toBe('jane@gmail.com')
    expect(getAuthMethods).not.toHaveBeenCalled()
  })

  it('still rejects an unverified email without the sign-in policy', async () => {
    getToken.mockResolvedValue(grantedTokens())
    verifyIdToken.mockResolvedValue(ticket({ sub: '123', email: 'jane@example.com', email_verified: false }))

    await expect(exchangeGoogleCode('auth-code', { enforceSignInPolicy: false })).rejects.toThrow(/Unverified/)
  })

  it('rejects without calling Google when no client secret is configured', async () => {
    getGoogleClientSecret.mockResolvedValue(null)

    await expect(exchangeGoogleCode('auth-code')).rejects.toMatchObject({
      code: 'DOMAIN_NOT_ALLOWED',
      message: expect.stringContaining('client secret'),
    })
    expect(getToken).not.toHaveBeenCalled()
  })

  it('rejects without calling Google when no client id is configured', async () => {
    getGoogleClientId.mockResolvedValue(null)

    await expect(exchangeGoogleCode('auth-code')).rejects.toMatchObject({ code: 'DOMAIN_NOT_ALLOWED' })
    expect(getToken).not.toHaveBeenCalled()
  })

  it('tags an invalid or expired code', async () => {
    getToken.mockRejectedValue(
      Object.assign(new Error('invalid_grant'), { response: { data: { error: 'invalid_grant' } } })
    )

    await expect(exchangeGoogleCode('auth-code')).rejects.toMatchObject({ code: INVALID_GOOGLE_CODE })
    expect(verifyIdToken).not.toHaveBeenCalled()
  })

  it('wraps any other exchange failure in a plain error that carries no request details', async () => {
    const failure = Object.assign(new Error('invalid_client'), {
      config: { data: 'client_secret=GOCSPX-secret&code=auth-code' },
      response: { data: { error: 'invalid_client' } },
    })
    getToken.mockRejectedValue(failure)

    const err = await exchangeGoogleCode('auth-code').catch(error => error)

    expect(err.message).toBe('Google did not exchange the authorization code: invalid_client')
    expect(err.code).toBeUndefined()
    expect(err.config).toBeUndefined()
  })
})
