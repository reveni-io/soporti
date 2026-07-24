import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SharedView from './SharedView.jsx'

vi.mock('../../common/Message/Message.jsx', () => ({
  default: ({ message }) => <div data-testid="message">{message.content || message.role}</div>,
}))

describe('SharedView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {}))
    render(<SharedView shareId="abc123" />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders shared conversation on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'abc',
        title: 'Test conversation',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', parts: [{ type: 'text', content: 'Hi' }] },
        ],
        createdAt: '2024-01-01T00:00:00Z',
        expiresAt: '2024-01-02T00:00:00Z',
      }),
    })

    render(<SharedView shareId="abc123" />)

    await waitFor(() => {
      expect(screen.getByText('Soporti')).toBeInTheDocument()
    })

    expect(screen.getByText('Shared conversation')).toBeInTheDocument()
    expect(screen.getAllByTestId('message')).toHaveLength(2)
  })

  it('shows error state for expired share', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    })

    render(<SharedView shareId="expired" />)

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument()
    })
  })

  it('shows error state on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    render(<SharedView shareId="abc" />)

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument()
    })
  })
})
