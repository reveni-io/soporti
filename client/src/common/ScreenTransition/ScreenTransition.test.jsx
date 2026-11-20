import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const transitions = vi.hoisted(() => [])

vi.mock('react', async importOriginal => {
  const actual = await importOriginal()

  function ViewTransitionSpy(props) {
    transitions.push(props)
    return props.children
  }

  return { ...actual, ViewTransition: ViewTransitionSpy }
})

const { default: ScreenTransition } = await import('./ScreenTransition.jsx')

describe('ScreenTransition', () => {
  it('fades the screen in and out when it comes and goes, and leaves updates alone', () => {
    transitions.length = 0

    render(
      <ScreenTransition>
        <p>Bots</p>
      </ScreenTransition>
    )

    expect(screen.getByText('Bots')).toBeInTheDocument()
    expect(transitions).toHaveLength(1)
    expect(transitions[0]).toMatchObject({ enter: 'screen', exit: 'screen', update: 'none', default: 'none' })
  })

  it('also animates updates when asked to, for a screen that stays mounted between routes', () => {
    transitions.length = 0

    render(
      <ScreenTransition animatesUpdates>
        <p>Chat</p>
      </ScreenTransition>
    )

    expect(screen.getByText('Chat')).toBeInTheDocument()
    expect(transitions).toHaveLength(1)
    expect(transitions[0]).toMatchObject({ enter: 'screen', exit: 'screen', update: 'screen', default: 'none' })
  })
})
