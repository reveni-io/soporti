import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useServiceWorkerNavigation } from './useServiceWorkerNavigation.js'

const ROUTER = {
  wrapper: ({ children }) => createElement(MemoryRouter, { initialEntries: ['/chat'] }, children),
}

function stubServiceWorker() {
  const container = new EventTarget()
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true })

  return container
}

function useNavigatedLocation() {
  useServiceWorkerNavigation()

  return useLocation()
}

function post(container, data) {
  act(() => {
    container.dispatchEvent(new MessageEvent('message', { data }))
  })
}

afterEach(() => {
  delete navigator.serviceWorker
})

describe('useServiceWorkerNavigation', () => {
  it('opens the page a notification points to', () => {
    const container = stubServiceWorker()
    const { result } = renderHook(() => useNavigatedLocation(), ROUTER)

    post(container, { type: 'soporti:navigate', url: '/chat?conversation=abc' })

    expect(result.current.pathname).toBe('/chat')
    expect(result.current.search).toBe('?conversation=abc')
  })

  it.each([
    ['another message type', { type: 'soporti:other', url: '/bots/12' }],
    ['an absolute url', { type: 'soporti:navigate', url: 'https://evil.test/phish' }],
    ['a protocol-relative url', { type: 'soporti:navigate', url: '//evil.test/phish' }],
    ['a url that is not a string', { type: 'soporti:navigate', url: 12 }],
    ['an empty message', null],
  ])('ignores %s', (_label, data) => {
    const container = stubServiceWorker()
    const { result } = renderHook(() => useNavigatedLocation(), ROUTER)

    post(container, data)

    expect(result.current.pathname).toBe('/chat')
  })

  it('stops listening when it unmounts', () => {
    const container = stubServiceWorker()
    const { result, unmount } = renderHook(() => useNavigatedLocation(), ROUTER)

    unmount()
    post(container, { type: 'soporti:navigate', url: '/bots/12' })

    expect(result.current.pathname).toBe('/chat')
  })

  it('does nothing in a browser without service workers', () => {
    const { result } = renderHook(() => useNavigatedLocation(), ROUTER)

    expect(result.current.pathname).toBe('/chat')
  })
})
