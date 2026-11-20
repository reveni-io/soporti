import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { useConversationLink } from './useConversationLink.js'

const CONVERSATION_ID = '0b6f5c1e-8f4a-4d2b-9c3e-2a1b0c9d8e7f'

describe('useConversationLink', () => {
  it('opens the linked conversation and drops the param from the url', () => {
    const onOpen = vi.fn()

    const { result } = renderHook(
      () => {
        useConversationLink('tok', onOpen)
        return useLocation()
      },
      {
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={[`/chat?conversation=${CONVERSATION_ID}`]}>{children}</MemoryRouter>
        ),
      }
    )

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(CONVERSATION_ID)
    expect(result.current.pathname).toBe('/chat')
    expect(result.current.search).toBe('')
  })

  it('opens a conversation linked while the page is already open, every time it is linked', () => {
    const onOpen = vi.fn()
    const { result } = renderHook(
      () => {
        useConversationLink('tok', onOpen)
        return { navigate: useNavigate(), location: useLocation() }
      },
      { wrapper: ({ children }) => <MemoryRouter initialEntries={['/bots/3']}>{children}</MemoryRouter> }
    )
    expect(onOpen).not.toHaveBeenCalled()

    act(() => {
      result.current.navigate(`/chat?conversation=${CONVERSATION_ID}`)
    })
    act(() => {
      result.current.navigate(`/chat?conversation=${CONVERSATION_ID}`)
    })

    expect(onOpen).toHaveBeenCalledTimes(2)
    expect(onOpen).toHaveBeenLastCalledWith(CONVERSATION_ID)
    expect(result.current.location.search).toBe('')
  })

  it('ignores a value that is not a conversation id', () => {
    const onOpen = vi.fn()

    const { result } = renderHook(
      () => {
        useConversationLink('tok', onOpen)
        return useLocation()
      },
      {
        wrapper: ({ children }) => <MemoryRouter initialEntries={['/chat?conversation=42']}>{children}</MemoryRouter>,
      }
    )

    expect(onOpen).not.toHaveBeenCalled()
    expect(result.current.search).toBe('?conversation=42')
  })

  it('waits for the user to sign in before opening the conversation', () => {
    const onOpen = vi.fn()
    const { rerender } = renderHook(({ token }) => useConversationLink(token, onOpen), {
      initialProps: { token: null },
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={[`/chat?conversation=${CONVERSATION_ID}`]}>{children}</MemoryRouter>
      ),
    })
    expect(onOpen).not.toHaveBeenCalled()

    rerender({ token: 'tok' })

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(CONVERSATION_ID)
  })

  it('opens the conversation once even when React runs the effect twice', () => {
    const onOpen = vi.fn()

    renderHook(() => useConversationLink('tok', onOpen), {
      reactStrictMode: true,
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={[`/chat?conversation=${CONVERSATION_ID}`]}>{children}</MemoryRouter>
      ),
    })

    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
