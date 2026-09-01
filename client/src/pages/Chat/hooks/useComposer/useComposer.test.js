import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useComposer } from './useComposer.js'

const SKILLS = [
  { id: 1, name: 'triage-ticket', description: 'Triage a ticket' },
  { id: 2, name: 'trace-order' },
  { id: 3, name: 'review-pr' },
]

function setup({
  skills = SKILLS,
  isLoading = false,
  hasSourcesSelected = true,
  onSend = vi.fn(),
  initialInput = '',
} = {}) {
  const view = renderHook(() => useComposer({ skills, isLoading, hasSourcesSelected, onSend, initialInput }))
  const type = value => act(() => view.result.current.onChange({ target: { value } }))
  return { ...view, type, onSend }
}

function keyEvent(key, extra = {}) {
  return { key, preventDefault: vi.fn(), shiftKey: false, ...extra }
}

describe('useComposer', () => {
  it('sends the typed text with no skills attached', () => {
    const { result, type, onSend } = setup()

    type('  how do refunds work?  ')
    act(() => result.current.onSubmit({ preventDefault: vi.fn() }))

    expect(onSend).toHaveBeenCalledWith('how do refunds work?', [])
    expect(result.current.input).toBe('')
  })

  it('clears the draft when another conversation is displayed', () => {
    const { result, rerender } = renderHook(
      ({ conversationKey }) =>
        useComposer({ skills: SKILLS, hasSourcesSelected: true, onSend: vi.fn(), conversationKey }),
      { initialProps: { conversationKey: 'chat-1' } }
    )

    act(() => result.current.onChange({ target: { value: 'half written question' } }))
    expect(result.current.input).toBe('half written question')

    rerender({ conversationKey: 'chat-2' })

    expect(result.current.input).toBe('')
  })

  it('keeps the question it was opened with on the conversation it belongs to', () => {
    const { result, rerender } = renderHook(
      ({ conversationKey }) =>
        useComposer({
          skills: SKILLS,
          hasSourcesSelected: true,
          onSend: vi.fn(),
          initialInput: 'why did that refund fail?',
          conversationKey,
        }),
      { initialProps: { conversationKey: 'chat-1' } }
    )

    expect(result.current.input).toBe('why did that refund fail?')

    rerender({ conversationKey: 'chat-1' })

    expect(result.current.input).toBe('why did that refund fail?')
  })

  it('starts from the initial input it is given and sends it untouched', () => {
    const { result, onSend } = setup({ initialInput: 'why did that refund fail?' })

    expect(result.current.input).toBe('why did that refund fail?')
    expect(result.current.canSend).toBe(true)

    act(() => result.current.onSubmit({ preventDefault: vi.fn() }))

    expect(onSend).toHaveBeenCalledWith('why did that refund fail?', [])
  })

  it('strips the command prefix and attaches the invoked skill', () => {
    const { result, type, onSend } = setup()

    type('/trace-order 1024')
    expect(result.current.commandPrefix).toBe('/trace-order')

    act(() => result.current.onSubmit({ preventDefault: vi.fn() }))

    expect(onSend).toHaveBeenCalledWith('1024', [{ id: 2, name: 'trace-order' }])
  })

  it('refuses to send while loading, without sources, or with an empty message', () => {
    const loading = setup({ isLoading: true })
    loading.type('hello')
    act(() => loading.result.current.onSubmit({ preventDefault: vi.fn() }))
    expect(loading.onSend).not.toHaveBeenCalled()

    const noSources = setup({ hasSourcesSelected: false })
    noSources.type('hello')
    expect(noSources.result.current.canSend).toBe(false)
    act(() => noSources.result.current.onSubmit({ preventDefault: vi.fn() }))
    expect(noSources.onSend).not.toHaveBeenCalled()

    const empty = setup()
    empty.type('   ')
    act(() => empty.result.current.onSubmit({ preventDefault: vi.fn() }))
    expect(empty.onSend).not.toHaveBeenCalled()
  })

  it('opens the menu with the skills matching the partial command', () => {
    const { result, type } = setup()

    type('/tr')

    expect(result.current.menuOpen).toBe(true)
    expect(result.current.matchingSkills.map(skill => skill.name)).toEqual(['triage-ticket', 'trace-order'])
  })

  it('closes the menu once the command is complete', () => {
    const { result, type } = setup()

    type('/trace-order ')

    expect(result.current.menuOpen).toBe(false)
  })

  it('never opens the menu when there are no skills', () => {
    const { result, type } = setup({ skills: [] })

    type('/tr')

    expect(result.current.menuOpen).toBe(false)
    expect(result.current.commandPrefix).toBe('')
  })

  it('walks the menu with the arrow keys and clamps at both ends', () => {
    const { result, type } = setup()
    type('/tr')

    act(() => result.current.onKeyDown(keyEvent('ArrowUp')))
    expect(result.current.menuIndex).toBe(0)

    act(() => result.current.onKeyDown(keyEvent('ArrowDown')))
    expect(result.current.menuIndex).toBe(1)

    act(() => result.current.onKeyDown(keyEvent('ArrowDown')))
    expect(result.current.menuIndex).toBe(1)

    act(() => result.current.onKeyDown(keyEvent('ArrowUp')))
    expect(result.current.menuIndex).toBe(0)
  })

  it('completes the highlighted skill with Enter instead of sending', () => {
    const { result, type, onSend } = setup()
    type('/tr')

    act(() => result.current.onKeyDown(keyEvent('ArrowDown')))
    act(() => result.current.onKeyDown(keyEvent('Enter')))

    expect(result.current.input).toBe('/trace-order ')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('completes the highlighted skill with Tab', () => {
    const { result, type } = setup()
    type('/tr')

    act(() => result.current.onKeyDown(keyEvent('Tab')))

    expect(result.current.input).toBe('/triage-ticket ')
  })

  it('sends on Enter when the menu is not navigable', () => {
    const { result, type, onSend } = setup()
    type('plain question')

    act(() => result.current.onKeyDown(keyEvent('Enter')))

    expect(onSend).toHaveBeenCalledWith('plain question', [])
  })

  it('does not send on shift+Enter', () => {
    const { result, type, onSend } = setup()
    type('plain question')

    act(() => result.current.onKeyDown(keyEvent('Enter', { shiftKey: true })))

    expect(onSend).not.toHaveBeenCalled()
  })

  it('dismisses the menu with Escape and on blur, and reopens it on the next keystroke', () => {
    const { result, type } = setup()
    type('/tr')

    act(() => result.current.onKeyDown(keyEvent('Escape')))
    expect(result.current.menuOpen).toBe(false)

    type('/tra')
    expect(result.current.menuOpen).toBe(true)

    act(() => result.current.onBlur())
    expect(result.current.menuOpen).toBe(false)
  })

  it('fills the input from an example', () => {
    const { result } = setup()

    act(() => result.current.fill('Show a chart of signups'))

    expect(result.current.input).toBe('Show a chart of signups')
  })

  it('cannot send while an attachment is still uploading', () => {
    const onSend = vi.fn()
    const { result } = renderHook(() =>
      useComposer({ skills: [], isLoading: false, hasSourcesSelected: true, isUploading: true, onSend })
    )

    act(() => result.current.onChange({ target: { value: 'summarize it' } }))
    expect(result.current.canSend).toBe(false)

    act(() => result.current.onSubmit({ preventDefault: () => {} }))

    expect(onSend).not.toHaveBeenCalled()
  })
})
