import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCitations } from './useCitations.js'

const MARKDOWN = 'See [the policy](https://notion.so/refunds) and [the issue](https://sentry.io/issues/1).'

describe('useCitations', () => {
  it('extracts the citations of the answer and starts collapsed', () => {
    const { result } = renderHook(() => useCitations(MARKDOWN))

    expect(result.current.citations.map(citation => citation.title)).toEqual(['the policy', 'the issue'])
    expect(result.current.isOpen).toBe(false)
    expect(result.current.selectedUrl).toBe(null)
  })

  it('opens the panel on the selected source', () => {
    const { result } = renderHook(() => useCitations(MARKDOWN))

    act(() => result.current.select('https://sentry.io/issues/1'))

    expect(result.current.isOpen).toBe(true)
    expect(result.current.selectedUrl).toBe('https://sentry.io/issues/1')
  })

  it('reopens the panel on a source selected after it was closed by hand', () => {
    const { result } = renderHook(() => useCitations(MARKDOWN))

    act(() => result.current.select('https://sentry.io/issues/1'))
    act(() => result.current.toggle())
    act(() => result.current.select('https://notion.so/refunds'))

    expect(result.current.isOpen).toBe(true)
    expect(result.current.selectedUrl).toBe('https://notion.so/refunds')
  })

  it('clears the selection when the panel is toggled by hand', () => {
    const { result } = renderHook(() => useCitations(MARKDOWN))

    act(() => result.current.select('https://sentry.io/issues/1'))
    act(() => result.current.toggle())

    expect(result.current.isOpen).toBe(false)
    expect(result.current.selectedUrl).toBe(null)
  })

  it('keeps the same citations across re-renders of the same answer', () => {
    const { result, rerender } = renderHook(({ markdown }) => useCitations(markdown), {
      initialProps: { markdown: MARKDOWN },
    })
    const first = result.current.citations

    rerender({ markdown: MARKDOWN })

    expect(result.current.citations).toBe(first)
  })

  it('picks up a citation added while the answer streams in', () => {
    const { result, rerender } = renderHook(({ markdown }) => useCitations(markdown), {
      initialProps: { markdown: 'See [the policy](https://notion.so/refunds)' },
    })
    expect(result.current.citations).toHaveLength(1)

    rerender({ markdown: MARKDOWN })

    expect(result.current.citations).toHaveLength(2)
  })
})
