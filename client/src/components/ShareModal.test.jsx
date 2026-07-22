import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ShareModal from './ShareModal.jsx'

describe('ShareModal', () => {
  let writeTextMock

  beforeEach(() => {
    vi.clearAllMocks()
    writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    })
  })

  it('renders share URL in input', () => {
    render(<ShareModal url="https://example.com/share/abc" onClose={vi.fn()} />)
    const input = screen.getByDisplayValue('https://example.com/share/abc')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('readonly')
  })

  it('renders title and buttons', () => {
    render(<ShareModal url="https://example.com" onClose={vi.fn()} />)
    expect(screen.getByText('Share conversation')).toBeInTheDocument()
    expect(screen.getByText('Copy')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('shows expiration notice', () => {
    render(<ShareModal url="https://example.com" onClose={vi.fn()} />)
    expect(screen.getByText(/24 hours/)).toBeInTheDocument()
  })

  it('calls onClose when Done clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<ShareModal url="https://example.com" onClose={onClose} />)

    await user.click(screen.getByText('Done'))
    expect(onClose).toHaveBeenCalled()
  })

  it('copies URL to clipboard', () => {
    render(<ShareModal url="https://example.com/share/abc" onClose={vi.fn()} />)

    fireEvent.click(screen.getByText('Copy'))
    expect(writeTextMock).toHaveBeenCalledWith('https://example.com/share/abc')
  })
})
