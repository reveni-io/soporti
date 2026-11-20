import { describe, it, expect, vi, afterEach } from 'vitest'
import { UUID_RE } from '../../../../constants.js'
import { createRequestId } from './request-id.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createRequestId', () => {
  it('uses the browser uuid generator when it exists', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('0b6f3c2a-5d4e-4f61-8a7b-9c0d1e2f3a4b')

    expect(createRequestId()).toBe('0b6f3c2a-5d4e-4f61-8a7b-9c0d1e2f3a4b')
  })

  it('builds a version 4 uuid from random bytes outside a secure context', () => {
    vi.spyOn(crypto, 'randomUUID', 'get').mockReturnValue(undefined)
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(bytes => bytes.fill(0xff))

    const id = createRequestId()

    expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
    expect(id).toMatch(UUID_RE)
  })

  it('creates a different id every time without the browser generator', () => {
    vi.spyOn(crypto, 'randomUUID', 'get').mockReturnValue(undefined)

    const first = createRequestId()
    const second = createRequestId()

    expect(first).toMatch(UUID_RE)
    expect(second).toMatch(UUID_RE)
    expect(second).not.toBe(first)
  })
})
