import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'

vi.mock('../db/oauth-codes.js', () => ({
  createAuthorizationCode: vi.fn(),
  consumeAuthorizationCode: vi.fn(),
}))

const { createAuthorizationCode, consumeAuthorizationCode } = await import('../db/oauth-codes.js')
const { isValidCodeChallenge, issueAuthorizationCode, redeemAuthorizationCode, verifyCodeChallenge } =
  await import('./codes.js')
const { hashSecret } = await import('./secrets.js')

const VERIFIER = 'a'.repeat(64)
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url')

const GRANT = {
  clientId: 'cid',
  userId: 7,
  redirectUri: 'https://claude.ai/cb',
  codeChallenge: CHALLENGE,
  scope: 'mcp',
  resource: 'https://soporti.test/api/mcp',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isValidCodeChallenge', () => {
  it('accepts a 43 to 128 character url-safe string', () => {
    expect(isValidCodeChallenge(CHALLENGE)).toBe(true)
  })

  it('rejects a short challenge, an unsafe character and a non-string', () => {
    expect(isValidCodeChallenge('short')).toBe(false)
    expect(isValidCodeChallenge(`${'a'.repeat(42)}/`)).toBe(false)
    expect(isValidCodeChallenge(null)).toBe(false)
  })
})

describe('verifyCodeChallenge', () => {
  it('accepts the verifier the challenge was derived from', () => {
    expect(verifyCodeChallenge(VERIFIER, CHALLENGE)).toBe(true)
  })

  it('rejects another verifier and a malformed one', () => {
    expect(verifyCodeChallenge('b'.repeat(64), CHALLENGE)).toBe(false)
    expect(verifyCodeChallenge('too-short', CHALLENGE)).toBe(false)
  })
})

describe('issueAuthorizationCode', () => {
  it('stores only the hash of the code and returns the code itself', async () => {
    const code = await issueAuthorizationCode({
      clientId: 'cid',
      userId: 7,
      redirectUri: 'https://claude.ai/cb',
      codeChallenge: CHALLENGE,
      scope: 'mcp',
      resource: 'https://soporti.test/api/mcp',
    })

    const [stored] = createAuthorizationCode.mock.calls[0]
    expect(stored.codeHash).toBe(hashSecret(code))
    expect(stored.codeHash).not.toBe(code)
    expect(stored.userId).toBe(7)
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('stores a null resource when the client did not send one', async () => {
    await issueAuthorizationCode({
      clientId: 'cid',
      userId: 7,
      redirectUri: 'https://claude.ai/cb',
      codeChallenge: CHALLENGE,
      scope: 'mcp',
    })

    expect(createAuthorizationCode.mock.calls[0][0].resource).toBeNull()
  })
})

describe('redeemAuthorizationCode', () => {
  it('returns the granted user when everything matches', async () => {
    consumeAuthorizationCode.mockResolvedValue(GRANT)

    const result = await redeemAuthorizationCode({
      code: 'the-code',
      clientId: 'cid',
      redirectUri: 'https://claude.ai/cb',
      codeVerifier: VERIFIER,
    })

    expect(result).toEqual({ value: { userId: 7, scope: 'mcp' } })
    expect(consumeAuthorizationCode).toHaveBeenCalledWith(hashSecret('the-code'))
  })

  it('rejects a missing code without touching the database', async () => {
    expect((await redeemAuthorizationCode({ clientId: 'cid' })).error).toMatch(/missing/)
    expect(consumeAuthorizationCode).not.toHaveBeenCalled()
  })

  it('rejects a code that was already used or expired', async () => {
    consumeAuthorizationCode.mockResolvedValue(null)

    const result = await redeemAuthorizationCode({
      code: 'the-code',
      clientId: 'cid',
      redirectUri: 'https://claude.ai/cb',
      codeVerifier: VERIFIER,
    })

    expect(result.error).toMatch(/already used/)
  })

  it('rejects a code redeemed by another client', async () => {
    consumeAuthorizationCode.mockResolvedValue(GRANT)

    const result = await redeemAuthorizationCode({
      code: 'the-code',
      clientId: 'other',
      redirectUri: 'https://claude.ai/cb',
      codeVerifier: VERIFIER,
    })

    expect(result.error).toMatch(/another client/)
  })

  it('rejects a redirect_uri that does not match the authorization request', async () => {
    consumeAuthorizationCode.mockResolvedValue(GRANT)

    const result = await redeemAuthorizationCode({
      code: 'the-code',
      clientId: 'cid',
      redirectUri: 'https://claude.ai/other',
      codeVerifier: VERIFIER,
    })

    expect(result.error).toMatch(/redirect_uri/)
  })

  it('rejects a code_verifier that does not derive the stored challenge', async () => {
    consumeAuthorizationCode.mockResolvedValue(GRANT)

    const result = await redeemAuthorizationCode({
      code: 'the-code',
      clientId: 'cid',
      redirectUri: 'https://claude.ai/cb',
      codeVerifier: 'b'.repeat(64),
    })

    expect(result.error).toMatch(/code_verifier/)
  })
})
