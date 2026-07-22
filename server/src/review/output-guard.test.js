import { describe, it, expect } from 'vitest'
import { redactSecrets } from './output-guard.js'

describe('redactSecrets', () => {
  it('returns clean text untouched', () => {
    const text = 'The fix in `src/checkout.js:11` looks correct; sumItems handles the empty cart.'
    expect(redactSecrets(text)).toBe(text)
  })

  it('redacts known credential formats wherever they appear', () => {
    const tokens = [
      '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', // Shopify admin token
      'shpss_0123456789abcdef0123456789abcdef', // Shopify shared secret
      'ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', // GitHub PAT
      'github_pat_11ABCDEFG0123456789_abcdefghij', // GitHub fine-grained PAT
      'xoxb-1234567890-abcdefghijklmn', // Slack bot token
      'AKIAIOSFODNN7EXAMPLE', // AWS access key id
      'sk-proj-AbCd1234EfGh5678IjKl', // OpenAI-style key
      'rk_live_0123456789abcdef0123', // Stripe-style key
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk', // JWT
    ]

    for (const token of tokens) {
      const out = redactSecrets(`The value is ${token} according to the database.`)
      expect(out, token).not.toContain(token)
      expect(out, token).toContain('[redacted]')
    }
  })

  it('redacts credentials embedded in connection strings, keeping the host readable', () => {
    const out = redactSecrets('Use postgres://app_user:s3cr3t-pw@db.internal:5432/soporti to connect.')

    expect(out).toBe('Use postgres://[redacted]@db.internal:5432/soporti to connect.')
  })

  it('redacts private key blocks', () => {
    const out = redactSecrets(
      'Found this:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\ndone'
    )

    expect(out).not.toContain('MIIEowIBAAKCAQEA')
    expect(out).toContain('[redacted]')
  })

  it('leaves commit shas, file paths and plain URLs alone', () => {
    const text =
      'Commit deadbeefcafe1234567890abcdef1234567890ab touches src/review/agent.js; see https://github.com/reveni-io/soporti/pull/123.'
    expect(redactSecrets(text)).toBe(text)
  })

  it('passes through empty and non-string values', () => {
    expect(redactSecrets('')).toBe('')
    expect(redactSecrets(null)).toBe(null)
    expect(redactSecrets(undefined)).toBe(undefined)
  })
})
