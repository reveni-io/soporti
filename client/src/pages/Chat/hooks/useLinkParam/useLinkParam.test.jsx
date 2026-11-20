import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom'
import { useLinkParam } from './useLinkParam.js'

describe('useLinkParam', () => {
  it('reads the value of the param from the url', () => {
    const { result } = renderHook(() => useLinkParam('shared'), {
      wrapper: ({ children }) => <MemoryRouter initialEntries={['/chat?shared=1']}>{children}</MemoryRouter>,
    })

    expect(result.current.value).toBe('1')
  })

  it('reads null when the url does not carry the param', () => {
    const { result } = renderHook(() => useLinkParam('shared'), {
      wrapper: ({ children }) => <MemoryRouter initialEntries={['/chat']}>{children}</MemoryRouter>,
    })

    expect(result.current.value).toBeNull()
  })

  it('removes only that param, in place of the current history entry', () => {
    const { result } = renderHook(
      () => ({ link: useLinkParam('shared'), location: useLocation(), navigationType: useNavigationType() }),
      {
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={['/chat?q=refunds&shared=1']}>{children}</MemoryRouter>
        ),
      }
    )

    act(() => {
      result.current.link.clear()
    })

    expect(result.current.link.value).toBeNull()
    expect(result.current.location.pathname).toBe('/chat')
    expect(result.current.location.search).toBe('?q=refunds')
    expect(result.current.navigationType).toBe('REPLACE')
  })
})
