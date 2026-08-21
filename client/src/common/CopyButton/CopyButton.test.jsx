import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CopyButton from './CopyButton.jsx'

const COPIED_FEEDBACK_MS = 2000

const REAL_CLIPBOARD = navigator.clipboard

function useClipboard(clipboard) {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
}

afterEach(() => {
  vi.useRealTimers()
  useClipboard(REAL_CLIPBOARD)
})

describe('CopyButton', () => {
  it('copies the text to the clipboard and confirms it', async () => {
    const user = userEvent.setup()

    render(<CopyButton text="const a = 1" ariaLabel="Copy code" />)
    await user.click(screen.getByRole('button', { name: 'Copy code' }))

    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    expect(screen.getByText('Copied!')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe('const a = 1')
  })

  it('goes back to the idle label after the feedback window', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    useClipboard({ writeText })

    render(<CopyButton text="const a = 1" ariaLabel="Copy code" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    })
    expect(screen.getByText('Copied!')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(COPIED_FEEDBACK_MS)
    })

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('const a = 1')
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })

  it('does nothing when the clipboard is unavailable', () => {
    useClipboard(undefined)

    render(<CopyButton text="const a = 1" ariaLabel="Copy code" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))

    expect(screen.getByText('Copy')).toBeInTheDocument()
  })

  it('styles the surface variant by default and honours the inverse one', () => {
    const { rerender } = render(<CopyButton text="x" ariaLabel="Copy code" />)
    expect(screen.getByRole('button', { name: 'Copy code' })).toHaveClass('copy-button--surface')

    rerender(<CopyButton text="x" ariaLabel="Copy code" variant="inverse" />)

    expect(screen.getByRole('button', { name: 'Copy code' })).toHaveClass('copy-button--inverse')
  })
})
