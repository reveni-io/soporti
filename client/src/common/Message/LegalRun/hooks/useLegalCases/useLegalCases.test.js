import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useLegalCases } from './useLegalCases.js'

const REPLY = { id: 7, sentBy: 'ana@example.com', text: 'Hello', sentAt: '2026-11-20T10:00:00.000Z' }

function respond(status, body) {
  return { ok: status < 400, status, json: async () => body }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useLegalCases', () => {
  it('loads the state of each case by id', async () => {
    const legalCase = { id: 41, replies: [], send: { allowed: true, reason: null } }
    global.fetch = vi.fn(async () => respond(200, { cases: [legalCase] }))

    const onLogout = vi.fn()

    const { result } = renderHook(() => useLegalCases('tok', [41, 42], onLogout))

    await waitFor(() => expect(result.current.cases.get(41)).toEqual(legalCase))
    expect(global.fetch.mock.calls[0][0]).toContain('/api/legal/cases?ids=41,42')
    expect(result.current.error).toBeNull()
  })

  it('asks for nothing without a token or without cases', () => {
    global.fetch = vi.fn()

    const onLogout = vi.fn()

    renderHook(() => useLegalCases(null, [41], onLogout))
    renderHook(() => useLegalCases('tok', [], onLogout))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('shows why the cases could not be loaded', async () => {
    global.fetch = vi.fn(async () => respond(500, { error: 'Failed to load the cases.' }))

    const onLogout = vi.fn()

    const { result } = renderHook(() => useLegalCases('tok', [41], onLogout))

    await waitFor(() => expect(result.current.error).toBe('Failed to load the cases.'))
  })

  it('logs out when the session expired', async () => {
    global.fetch = vi.fn(async () => respond(401, { error: 'Session expired' }))
    const onLogout = vi.fn()

    const { result } = renderHook(() => useLegalCases('tok', [41], onLogout))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(result.current.error).toBeNull()
  })

  it('adds a sent reply to its case and ignores unknown cases', async () => {
    global.fetch = vi.fn(async () => respond(200, { cases: [{ id: 41, replies: [], send: { allowed: true } }] }))
    const onLogout = vi.fn()
    const { result } = renderHook(() => useLegalCases('tok', [41], onLogout))
    await waitFor(() => expect(result.current.cases.has(41)).toBe(true))
    const before = result.current.cases

    act(() => result.current.addReply(99, REPLY))
    expect(result.current.cases).toBe(before)

    act(() => result.current.addReply(41, REPLY))
    expect(result.current.cases.get(41).replies).toEqual([REPLY])
  })
})
