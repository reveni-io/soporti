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

const { default: SharedElement } = await import('./SharedElement.jsx')

describe('SharedElement', () => {
  it('morphs into the element with the same name on the next screen, and stays still otherwise', () => {
    render(
      <SharedElement name="bot-avatar-7">
        <span>Avatar</span>
      </SharedElement>
    )

    expect(screen.getByText('Avatar')).toBeInTheDocument()
    expect(transitions).toHaveLength(1)
    expect(transitions[0]).toMatchObject({ name: 'bot-avatar-7', share: 'morph', default: 'none' })
  })
})
