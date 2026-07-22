import { describe, it, expect } from 'vitest'
import { parseRepo, sanitizePath, BLOCKED_PATHS } from './sanitize.js'

describe('parseRepo', () => {
  it('parses valid owner/repo format', () => {
    expect(parseRepo('owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses repos with hyphens and dots', () => {
    expect(parseRepo('my-org/my-repo.js')).toEqual({ owner: 'my-org', repo: 'my-repo.js' })
  })

  it('throws on single segment', () => {
    expect(() => parseRepo('onlyrepo')).toThrow('Invalid repository format')
  })

  it('throws on empty string', () => {
    expect(() => parseRepo('')).toThrow('Invalid repository format')
  })

  it('throws on three segments', () => {
    expect(() => parseRepo('a/b/c')).toThrow('Invalid repository format')
  })
})

describe('sanitizePath', () => {
  it('returns empty string for falsy input', () => {
    expect(sanitizePath('')).toBe('')
    expect(sanitizePath(null)).toBe('')
    expect(sanitizePath(undefined)).toBe('')
  })

  it('strips leading slashes', () => {
    expect(sanitizePath('/src/index.js')).toBe('src/index.js')
    expect(sanitizePath('///src')).toBe('src')
  })

  it('decodes URL-encoded paths', () => {
    expect(sanitizePath('src%2Findex.js')).toBe('src/index.js')
  })

  it('throws on path traversal with ..', () => {
    expect(() => sanitizePath('../etc/passwd')).toThrow('Path traversal is not allowed')
    expect(() => sanitizePath('src/../../etc')).toThrow('Path traversal is not allowed')
  })

  it('throws on dot segment', () => {
    expect(() => sanitizePath('./src')).toThrow('Path traversal is not allowed')
  })

  it('throws on null bytes', () => {
    expect(() => sanitizePath('src/\0index.js')).toThrow('Invalid path')
  })

  it('throws on invalid URL encoding', () => {
    expect(() => sanitizePath('%ZZ')).toThrow('Invalid path encoding')
  })

  it('blocks .git directory', () => {
    expect(() => sanitizePath('.git/config')).toThrow('Access to ".git" is not allowed')
  })

  it('blocks .env file', () => {
    expect(() => sanitizePath('.env')).toThrow('Access to ".env" is not allowed')
  })

  it('blocks node_modules', () => {
    expect(() => sanitizePath('node_modules/express')).toThrow('Access to "node_modules" is not allowed')
  })

  it('blocks .aws and .ssh', () => {
    expect(() => sanitizePath('.aws/credentials')).toThrow('Access to ".aws" is not allowed')
    expect(() => sanitizePath('.ssh/id_rsa')).toThrow('Access to ".ssh" is not allowed')
  })

  it('blocks .env.local and .env.production', () => {
    expect(() => sanitizePath('.env.local')).toThrow('Access to ".env.local" is not allowed')
    expect(() => sanitizePath('.env.production')).toThrow('Access to ".env.production" is not allowed')
  })

  it('allows valid paths', () => {
    expect(sanitizePath('src/index.js')).toBe('src/index.js')
    expect(sanitizePath('README.md')).toBe('README.md')
    expect(sanitizePath('src/components/App.jsx')).toBe('src/components/App.jsx')
  })
})

describe('BLOCKED_PATHS', () => {
  it('contains expected sensitive paths', () => {
    expect(BLOCKED_PATHS).toContain('.git')
    expect(BLOCKED_PATHS).toContain('.env')
    expect(BLOCKED_PATHS).toContain('node_modules')
    expect(BLOCKED_PATHS).toContain('.aws')
    expect(BLOCKED_PATHS).toContain('.ssh')
  })
})
