import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/oauth-clients.js', () => ({
  createOAuthClient: vi.fn(),
  findOAuthClient: vi.fn(),
}))

const { createOAuthClient, findOAuthClient } = await import('../db/oauth-clients.js')
const { getClient, isRegisteredRedirectUri, isValidRedirectUri, parseClientRegistration, registerClient } =
  await import('./clients.js')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isValidRedirectUri', () => {
  it('accepts https URLs', () => {
    expect(isValidRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true)
  })

  it('accepts http loopback URLs, which is how CLI clients receive the code', () => {
    expect(isValidRedirectUri('http://localhost:51234/callback')).toBe(true)
    expect(isValidRedirectUri('http://127.0.0.1:51234/callback')).toBe(true)
  })

  it('rejects plain http on a remote host', () => {
    expect(isValidRedirectUri('http://evil.test/callback')).toBe(false)
  })

  it('rejects URLs with a fragment, a non-URL string and a non-string', () => {
    expect(isValidRedirectUri('https://claude.ai/cb#frag')).toBe(false)
    expect(isValidRedirectUri('not-a-url')).toBe(false)
    expect(isValidRedirectUri(42)).toBe(false)
  })
})

describe('parseClientRegistration', () => {
  it('returns the trimmed name and the redirect URIs', () => {
    expect(
      parseClientRegistration({ client_name: '  Claude Code  ', redirect_uris: ['https://claude.ai/cb'] })
    ).toEqual({ value: { name: 'Claude Code', redirectUris: ['https://claude.ai/cb'] } })
  })

  it('falls back to a generic name when the client sends none', () => {
    expect(parseClientRegistration({ redirect_uris: ['https://claude.ai/cb'] }).value.name).toBe('MCP client')
  })

  it('rejects a missing or empty redirect_uris', () => {
    expect(parseClientRegistration({}).error).toMatch(/non-empty array/)
    expect(parseClientRegistration({ redirect_uris: [] }).error).toMatch(/non-empty array/)
  })

  it('rejects more redirect URIs than allowed', () => {
    const redirect_uris = Array.from({ length: 11 }, (_, i) => `https://claude.ai/cb${i}`)

    expect(parseClientRegistration({ redirect_uris }).error).toMatch(/at most 10/)
  })

  it('rejects an invalid redirect URI', () => {
    expect(parseClientRegistration({ redirect_uris: ['http://evil.test/cb'] }).error).toMatch(/https URL/)
  })

  it('rejects a name that is too long', () => {
    expect(
      parseClientRegistration({ client_name: 'x'.repeat(101), redirect_uris: ['https://a.test/cb'] }).error
    ).toMatch(/too long/)
  })
})

describe('registerClient', () => {
  it('stores the client under a freshly generated id', async () => {
    createOAuthClient.mockResolvedValue({ clientId: 'generated' })

    const client = await registerClient({ name: 'Claude', redirectUris: ['https://claude.ai/cb'] })

    expect(client).toEqual({ clientId: 'generated' })
    expect(createOAuthClient).toHaveBeenCalledTimes(1)
    const [args] = createOAuthClient.mock.calls[0]
    expect(args.name).toBe('Claude')
    expect(args.redirectUris).toEqual(['https://claude.ai/cb'])
    expect(args.clientId).toMatch(/^[a-f0-9]{32}$/)
  })

  it('never generates the same client id twice', async () => {
    createOAuthClient.mockResolvedValue({})

    await registerClient({ name: 'a', redirectUris: ['https://a.test/cb'] })
    await registerClient({ name: 'b', redirectUris: ['https://b.test/cb'] })

    expect(createOAuthClient.mock.calls[0][0].clientId).not.toBe(createOAuthClient.mock.calls[1][0].clientId)
  })
})

describe('getClient', () => {
  it('looks the client up by id', async () => {
    findOAuthClient.mockResolvedValue({ clientId: 'cid' })

    expect(await getClient('cid')).toEqual({ clientId: 'cid' })
    expect(findOAuthClient).toHaveBeenCalledWith('cid')
  })

  it('returns null without querying when the id is missing', async () => {
    expect(await getClient(undefined)).toBeNull()
    expect(findOAuthClient).not.toHaveBeenCalled()
  })
})

describe('isRegisteredRedirectUri', () => {
  it('only accepts an exact match', () => {
    const client = { redirectUris: ['https://claude.ai/cb'] }

    expect(isRegisteredRedirectUri(client, 'https://claude.ai/cb')).toBe(true)
    expect(isRegisteredRedirectUri(client, 'https://claude.ai/cb/')).toBe(false)
    expect(isRegisteredRedirectUri(client, 'https://claude.ai/cb?x=1')).toBe(false)
  })

  it('rejects everything when the stored value is not a list', () => {
    expect(isRegisteredRedirectUri({ redirectUris: null }, 'https://claude.ai/cb')).toBe(false)
  })
})
