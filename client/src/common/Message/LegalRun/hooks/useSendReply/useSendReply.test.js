import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSendReply } from './useSendReply.js'

const REPLY = { id: 7, sentBy: 'ana@example.com', text: 'Hello', sentAt: '2026-11-20T10:00:00.000Z' }

function respond(status, body) {
  return { ok: status < 400, status, json: async () => body }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSendReply', () => {
  it('opens and closes the confirmation', () => {
    const { result } = renderHook(() => useSendReply('tok', 41, vi.fn(), vi.fn()))

    act(() => result.current.start())
    expect(result.current.confirming).toBe(true)

    act(() => result.current.cancel())
    expect(result.current.confirming).toBe(false)
  })

  it('sends the reply and hands it over once it went out', async () => {
    global.fetch = vi.fn(async () => respond(201, { reply: REPLY }))
    const onSent = vi.fn()
    const { result } = renderHook(() => useSendReply('tok', 41, onSent, vi.fn()))
    act(() => result.current.start())

    await act(() => result.current.send('Hello', true))

    expect(onSent).toHaveBeenCalledWith(REPLY)
    expect(result.current.confirming).toBe(false)
    expect(result.current.sending).toBe(false)
    expect(result.current.warning).toBeNull()
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/legal/cases/41/replies')
    expect(JSON.parse(options.body)).toEqual({ text: 'Hello', warningsRead: true })
  })

  it('keeps the warning of a reply that went out but was not recorded', async () => {
    const warning = 'The reply was sent, but Soporti could not record it.'
    global.fetch = vi.fn(async () => respond(201, { reply: { ...REPLY, id: null }, warning }))
    const onSent = vi.fn()
    const { result } = renderHook(() => useSendReply('tok', 41, onSent, vi.fn()))

    await act(() => result.current.send('Hello', false))

    expect(onSent).toHaveBeenCalledWith({ ...REPLY, id: null })
    expect(result.current.warning).toBe(warning)
  })

  it('keeps the confirmation open with the error when the send fails', async () => {
    global.fetch = vi.fn(async () => respond(502, { error: 'Zendesk did not take the reply.' }))
    const onSent = vi.fn()
    const { result } = renderHook(() => useSendReply('tok', 41, onSent, vi.fn()))
    act(() => result.current.start())

    await act(() => result.current.send('Hello', false))

    expect(result.current.error).toBe('Zendesk did not take the reply.')
    expect(result.current.confirming).toBe(true)
    expect(onSent).not.toHaveBeenCalled()
  })

  it('logs out when the session expired', async () => {
    global.fetch = vi.fn(async () => respond(401, { error: 'Session expired' }))
    const onLogout = vi.fn()
    const { result } = renderHook(() => useSendReply('tok', 41, vi.fn(), onLogout))

    await act(() => result.current.send('Hello', false))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(result.current.error).toBeNull()
  })
})
