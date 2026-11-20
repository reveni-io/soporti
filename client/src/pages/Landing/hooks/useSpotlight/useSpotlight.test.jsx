import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useSpotlight } from './useSpotlight.js'

function Grid() {
  const spotlight = useSpotlight()

  return (
    <div data-testid="grid" {...spotlight}>
      <div data-testid="card" data-spotlight="" />
      <div data-testid="plain" />
    </div>
  )
}

describe('useSpotlight', () => {
  it('moves the spotlight of every card to the pointer, relative to each card', () => {
    render(<Grid />)
    const card = screen.getByTestId('card')
    card.getBoundingClientRect = () => ({ left: 100, top: 40 })

    fireEvent.pointerMove(screen.getByTestId('grid'), { clientX: 160, clientY: 90 })

    expect(card.style.getPropertyValue('--spot-x')).toBe('60px')
    expect(card.style.getPropertyValue('--spot-y')).toBe('50px')
    expect(screen.getByTestId('plain').style.getPropertyValue('--spot-x')).toBe('')
  })
})
