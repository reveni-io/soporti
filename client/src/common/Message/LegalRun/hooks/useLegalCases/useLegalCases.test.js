import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLegalCases } from './useLegalCases.js'

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

  it('loads the cases again when the assistant sends a reply from the chat', async () => {
    const before = { id: 41, replies: [], send: { allowed: true, reason: null } }
    const reply = { id: 7, sentBy: 'ana@example.com', text: 'Hello', sentAt: '2026-11-20T10:00:00.000Z' }
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(200, { cases: [before] }))
      .mockResolvedValueOnce(respond(200, { cases: [{ ...before, replies: [reply] }] }))

    const onLogout = vi.fn()

    const { result } = renderHook(() => useLegalCases('tok', [41], onLogout))
    await waitFor(() => expect(result.current.cases.get(41)).toEqual(before))
    window.dispatchEvent(new Event('soporti:legal-reply-sent'))

    await waitFor(() => expect(result.current.cases.get(41).replies).toEqual([reply]))
    expect(global.fetch).toHaveBeenCalledTimes(2)
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
})
