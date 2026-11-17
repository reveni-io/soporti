import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { act, renderHook } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useChatView } from './useChatView.js'

function useViewWithLocation() {
  return { view: useChatView(), location: useLocation() }
}

function routerAt(path) {
  return function Wrapper({ children }) {
    return createElement(MemoryRouter, { initialEntries: [path] }, children)
  }
}

describe('useChatView', () => {
  it('reads the normal chat view', () => {
    const { result } = renderHook(() => useChatView(), { wrapper: routerAt('/chat') })

    expect(result.current.isChatView).toBe(true)
    expect(result.current.isBotsView).toBe(false)
    expect(result.current.isBotView).toBe(false)
    expect(result.current.botId).toBeNull()
  })

  it('reads the bots list view', () => {
    const { result } = renderHook(() => useChatView(), { wrapper: routerAt('/bots') })

    expect(result.current.isBotsView).toBe(true)
    expect(result.current.isChatView).toBe(false)
    expect(result.current.botId).toBeNull()
  })

  it('reads the bot the view is about', () => {
    const { result } = renderHook(() => useChatView(), { wrapper: routerAt('/bots/42') })

    expect(result.current.isBotView).toBe(true)
    expect(result.current.botId).toBe(42)
  })

  it('reads no bot from an id that is not a number', () => {
    const { result } = renderHook(() => useChatView(), { wrapper: routerAt('/bots/nope') })

    expect(result.current.isBotView).toBe(true)
    expect(result.current.botId).toBeNull()
  })

  it('navigates between the bots, a bot and the chat', () => {
    const { result } = renderHook(() => useViewWithLocation(), { wrapper: routerAt('/chat') })

    act(() => result.current.view.showBot(7))
    expect(result.current.location.pathname).toBe('/bots/7')

    act(() => result.current.view.showBots())
    expect(result.current.location.pathname).toBe('/bots')

    act(() => result.current.view.showChat())
    expect(result.current.location.pathname).toBe('/chat')
  })

  it('stays on the chat when it is already shown', () => {
    const { result } = renderHook(() => useViewWithLocation(), { wrapper: routerAt('/chat?q=refunds') })

    act(() => result.current.view.showChat())

    expect(result.current.location.search).toBe('?q=refunds')
  })
})
