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

  it('renders the title it was given and the buttons', () => {
    render(<ShareModal url="https://example.com" title="Share conversation" onClose={vi.fn()} />)
    expect(screen.getByText('Share conversation')).toBeInTheDocument()
    expect(screen.getByText('Copy')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('renders a different title so it serves artifacts too', () => {
    render(<ShareModal url="https://example.com" title="Share artifact" onClose={vi.fn()} />)
    expect(screen.getByText('Share artifact')).toBeInTheDocument()
    expect(screen.queryByText('Share conversation')).not.toBeInTheDocument()
  })

  it('shows expiration notice', () => {
    render(<ShareModal url="https://example.com" onClose={vi.fn()} />)
    expect(screen.getByText(/30 days/)).toBeInTheDocument()
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
