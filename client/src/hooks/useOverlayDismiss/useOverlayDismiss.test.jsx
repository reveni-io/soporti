import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useOverlayDismiss } from './useOverlayDismiss.js'

function Overlay({ onDismiss }) {
  const overlayProps = useOverlayDismiss(onDismiss)
  return (
    <div data-testid="overlay" {...overlayProps}>
      <div data-testid="content">
        <textarea data-testid="field" defaultValue="text" />
      </div>
    </div>
  )
}

describe('useOverlayDismiss', () => {
  it('dismisses when the press and the click both land on the overlay', () => {
    const onDismiss = vi.fn()
    render(<Overlay onDismiss={onDismiss} />)

    const overlay = screen.getByTestId('overlay')
    fireEvent.mouseDown(overlay)
    fireEvent.click(overlay)

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not dismiss when a selection starts inside and the release lands on the overlay', () => {
    const onDismiss = vi.fn()
    render(<Overlay onDismiss={onDismiss} />)

    fireEvent.mouseDown(screen.getByTestId('field'))
    fireEvent.click(screen.getByTestId('overlay'))

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('does not dismiss on clicks inside the modal content', () => {
    const onDismiss = vi.fn()
    render(<Overlay onDismiss={onDismiss} />)

    const content = screen.getByTestId('content')
    fireEvent.mouseDown(content)
    fireEvent.click(content)

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('requires a fresh press on the overlay for each dismissal', () => {
    const onDismiss = vi.fn()
    render(<Overlay onDismiss={onDismiss} />)

    const overlay = screen.getByTestId('overlay')
    fireEvent.mouseDown(overlay)
    fireEvent.click(overlay)
    fireEvent.click(overlay)

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
