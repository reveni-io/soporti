import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CodeCopyButton from './CodeCopyButton.jsx'

const COPIED_FEEDBACK_MS = 2000

const REAL_CLIPBOARD = navigator.clipboard

function useClipboard(clipboard) {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
}

afterEach(() => {
  vi.useRealTimers()
  useClipboard(REAL_CLIPBOARD)
})

describe('CodeCopyButton', () => {
  it('copies the code to the clipboard and confirms it', async () => {
    const user = userEvent.setup()

    render(<CodeCopyButton code="const a = 1" />)
    await user.click(screen.getByRole('button', { name: 'Copy code' }))

    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    expect(screen.getByText('Copied!')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe('const a = 1')
  })

  it('goes back to the idle label after the feedback window', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    useClipboard({ writeText })

    render(<CodeCopyButton code="const a = 1" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    })
    expect(screen.getByText('Copied!')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(COPIED_FEEDBACK_MS)
    })

    expect(writeText).toHaveBeenCalledWith('const a = 1')
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })

  it('does nothing when the clipboard is unavailable', () => {
    useClipboard(undefined)

    render(<CodeCopyButton code="const a = 1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))

    expect(screen.getByText('Copy')).toBeInTheDocument()
  })
})
