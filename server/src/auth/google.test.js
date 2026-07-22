import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyIdToken = vi.fn()
const getAllowedDomains = vi.fn()
const getAuthMethods = vi.fn()
const getGoogleClientId = vi.fn()

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn(function () {
    return { verifyIdToken }
  }),
}))
vi.mock('./allowed-domains.js', () => ({ getAllowedDomains }))
vi.mock('./auth-methods.js', () => ({ getAuthMethods }))
vi.mock('./google-settings.js', () => ({ getGoogleClientId }))

const { verifyGoogleCredential } = await import('./google.js')

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
  getGoogleClientId.mockResolvedValue('test-client-id.apps.googleusercontent.com')
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
