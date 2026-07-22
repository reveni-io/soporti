import { describe, it, expect } from 'vitest'
import { parseDatabaseConfig } from './index.js'

describe('parseDatabaseConfig', () => {
  it('strips sslmode=require and enables SSL with relaxed verification (managed DBs)', () => {
    const url = 'postgresql://appuser:secret@db.example-managed.com:25060/appdb?sslmode=require'

    const { connectionString, ssl } = parseDatabaseConfig(url)

    expect(connectionString).not.toContain('sslmode')
    expect(connectionString).toContain('appuser:secret@')
    expect(connectionString).toContain('appdb')
    expect(ssl).toEqual({ rejectUnauthorized: false })
  })

  it('disables SSL when sslmode is absent (local Docker postgres)', () => {
    const url = 'postgresql://soporti:soporti@db:5432/soporti'

    const { connectionString, ssl } = parseDatabaseConfig(url)

    expect(connectionString).toBe(url)
    expect(ssl).toBe(false)
  })

  it('disables SSL when sslmode=disable', () => {
    const url = 'postgresql://u:p@h:5432/d?sslmode=disable'

    const { ssl } = parseDatabaseConfig(url)

    expect(ssl).toBe(false)
  })

  it('enables SSL for verify-full as well', () => {
    const url = 'postgresql://u:p@h:5432/d?sslmode=verify-full'

    const { ssl } = parseDatabaseConfig(url)

    expect(ssl).toEqual({ rejectUnauthorized: false })
  })
})
