import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useOpenBot } from './useOpenBot.js'

function respond(status = 200) {
  return { ok: status < 400, status, json: async () => ({ ok: status < 400 }) }
}

function readCalls() {
  return global.fetch.mock.calls.filter(([url]) => String(url).endsWith('/read'))
}

function hookProps(overrides = {}) {
  return {
    token: 'tok',
    botId: 5,
    unreadCount: 0,
    isLoading: false,
    openBot: vi.fn().mockResolvedValue(),
    refreshBot: vi.fn().mockResolvedValue(),
    reloadBots: vi.fn().mockResolvedValue(),
    onLogout: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn().mockResolvedValue(respond())
})

describe('useOpenBot', () => {
  it('opens the bot, marks it read and reloads the bots', async () => {
    const props = hookProps()

    renderHook(() => useOpenBot(props))

    await waitFor(() => expect(props.reloadBots).toHaveBeenCalledTimes(1))
    expect(props.openBot).toHaveBeenCalledTimes(1)
    expect(props.openBot).toHaveBeenCalledWith(5)
    expect(readCalls()).toHaveLength(1)
    expect(readCalls()[0][0]).toBe('/api/bots/5/read')
    expect(readCalls()[0][1].method).toBe('POST')
    expect(props.refreshBot).not.toHaveBeenCalled()
  })

  it('does nothing outside a bot', async () => {
    const props = hookProps({ botId: null, unreadCount: 3 })

    renderHook(() => useOpenBot(props))

    expect(props.openBot).not.toHaveBeenCalled()
    expect(props.refreshBot).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does not refresh the chat it is already opening when the bot has unread results', async () => {
    const props = hookProps({ unreadCount: 2 })

    renderHook(() => useOpenBot(props))

    await waitFor(() => expect(props.reloadBots).toHaveBeenCalledTimes(1))
    expect(props.openBot).toHaveBeenCalledTimes(1)
    expect(props.refreshBot).not.toHaveBeenCalled()
  })

  it('pulls a new routine result into the open chat and marks it read', async () => {
    const props = hookProps()
    const { rerender } = renderHook(current => useOpenBot(current), { initialProps: props })
    await waitFor(() => expect(props.reloadBots).toHaveBeenCalledTimes(1))

    rerender({ ...props, unreadCount: 1 })

    await waitFor(() => expect(props.reloadBots).toHaveBeenCalledTimes(2))
    expect(props.refreshBot).toHaveBeenCalledTimes(1)
    expect(props.refreshBot).toHaveBeenCalledWith(5)
    expect(readCalls()).toHaveLength(2)
  })

  it('waits for the running answer before pulling a new routine result', async () => {
    const props = hookProps()
    const { rerender } = renderHook(current => useOpenBot(current), { initialProps: props })
    await waitFor(() => expect(props.reloadBots).toHaveBeenCalledTimes(1))

    rerender({ ...props, unreadCount: 1, isLoading: true })
    await Promise.resolve()
    expect(props.refreshBot).not.toHaveBeenCalled()

    rerender({ ...props, unreadCount: 1, isLoading: false })

    await waitFor(() => expect(props.refreshBot).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(props.reloadBots).toHaveBeenCalledTimes(2))
  })

  it('syncs again after a previous sync settled', async () => {
    const props = hookProps()
    const { rerender } = renderHook(current => useOpenBot(current), { initialProps: props })
    await waitFor(() => expect(props.reloadBots).toHaveBeenCalledTimes(1))

    rerender({ ...props, unreadCount: 1 })
    await waitFor(() => expect(props.reloadBots).toHaveBeenCalledTimes(2))
    rerender({ ...props, unreadCount: 0 })
    rerender({ ...props, unreadCount: 2 })

    await waitFor(() => expect(props.refreshBot).toHaveBeenCalledTimes(2))
  })

  it('logs out when marking the bot read answers 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(401))
    const props = hookProps()

    renderHook(() => useOpenBot(props))

    await waitFor(() => expect(props.onLogout).toHaveBeenCalledTimes(1))
    expect(props.reloadBots).not.toHaveBeenCalled()
  })

  it('ignores any other failure to mark the bot read', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(500))
    const props = hookProps()

    renderHook(() => useOpenBot(props))

    await waitFor(() => expect(readCalls()).toHaveLength(1))
    expect(props.onLogout).not.toHaveBeenCalled()
    expect(props.reloadBots).not.toHaveBeenCalled()
  })
})
