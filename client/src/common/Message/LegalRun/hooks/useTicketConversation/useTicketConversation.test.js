import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTicketConversation } from './useTicketConversation.js'

const MESSAGES = [{ id: '1', author: '', fromCustomer: true, at: '2026-11-20T10:00:00.000Z', text: 'Any news?' }]

function respond(status, body) {
  return { ok: status < 400, status, json: async () => body }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTicketConversation', () => {
  it('reads nothing until asked', () => {
    global.fetch = vi.fn()

    const { result } = renderHook(() => useTicketConversation('tok', 41, vi.fn()))

    expect(result.current.messages).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('loads the messages of the ticket', async () => {
    global.fetch = vi.fn(async () => respond(200, { messages: MESSAGES }))
    const { result } = renderHook(() => useTicketConversation('tok', 41, vi.fn()))

    await act(() => result.current.load())

    expect(result.current.messages).toEqual(MESSAGES)
    expect(result.current.notice).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(global.fetch.mock.calls[0][0]).toContain('/api/legal/cases/41/conversation')
  })

  it('keeps the notice of a ticket that was cut short', async () => {
    global.fetch = vi.fn(async () => respond(200, { messages: MESSAGES, notice: 'This ticket is long.' }))
    const { result } = renderHook(() => useTicketConversation('tok', 41, vi.fn()))

    await act(() => result.current.load())

    expect(result.current.notice).toBe('This ticket is long.')
  })

  it('shows why the ticket could not be read', async () => {
    global.fetch = vi.fn(async () => respond(502, { error: 'Could not read the Zendesk ticket.' }))
    const { result } = renderHook(() => useTicketConversation('tok', 41, vi.fn()))

    await act(() => result.current.load())

    expect(result.current.error).toBe('Could not read the Zendesk ticket.')
    expect(result.current.messages).toBeNull()
  })

  it('logs out when the session expired', async () => {
    global.fetch = vi.fn(async () => respond(401, { error: 'Session expired' }))
    const onLogout = vi.fn()
    const { result } = renderHook(() => useTicketConversation('tok', 41, onLogout))

    await act(() => result.current.load())

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })
})
