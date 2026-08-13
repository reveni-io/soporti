import { describe, it, expect, vi } from 'vitest'

vi.mock('../config.js', () => ({ default: { publicUrl: 'https://soporti.test' } }))

const {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  mcpResourceUri,
  protectedResourceMetadataUrl,
} = await import('./metadata.js')

describe('mcpResourceUri', () => {
  it('is the public URL of the MCP endpoint', () => {
    expect(mcpResourceUri()).toBe('https://soporti.test/api/mcp')
  })
})

describe('protectedResourceMetadataUrl', () => {
  it('inserts the well-known suffix between the host and the resource path', () => {
    expect(protectedResourceMetadataUrl()).toBe('https://soporti.test/.well-known/oauth-protected-resource/api/mcp')
  })
})

describe('buildProtectedResourceMetadata', () => {
  it('points at the authorization server and declares the bearer header', () => {
    expect(buildProtectedResourceMetadata()).toEqual({
      resource: 'https://soporti.test/api/mcp',
      authorization_servers: ['https://soporti.test'],
      scopes_supported: ['mcp'],
      bearer_methods_supported: ['header'],
    })
  })
})

describe('buildAuthorizationServerMetadata', () => {
  it('advertises a public client flow with PKCE only', () => {
    const metadata = buildAuthorizationServerMetadata()

    expect(metadata.issuer).toBe('https://soporti.test')
    expect(metadata.authorization_endpoint).toBe('https://soporti.test/api/oauth/authorize')
    expect(metadata.token_endpoint).toBe('https://soporti.test/api/oauth/token')
    expect(metadata.registration_endpoint).toBe('https://soporti.test/api/oauth/register')
    expect(metadata.response_types_supported).toEqual(['code'])
    expect(metadata.grant_types_supported).toEqual(['authorization_code', 'refresh_token'])
    expect(metadata.code_challenge_methods_supported).toEqual(['S256'])
    expect(metadata.token_endpoint_auth_methods_supported).toEqual(['none'])
  })
})
