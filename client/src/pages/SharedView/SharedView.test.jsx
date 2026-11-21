import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SharedView from './SharedView.jsx'

vi.mock('../../common/Message/Message.jsx', () => ({
  default: ({ message }) => <div data-testid="message">{message.content || message.role}</div>,
}))

describe('SharedView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('shows loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {}))
    render(
      <MemoryRouter>
        <SharedView shareId="abc123" />
      </MemoryRouter>
    )
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

    render(
      <MemoryRouter>
        <SharedView shareId="abc123" />
      </MemoryRouter>
    )

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

    render(
      <MemoryRouter>
        <SharedView shareId="expired" />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument()
    })
  })

  it('shows error state on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    render(
      <MemoryRouter>
        <SharedView shareId="abc" />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument()
    })
  })

  it('offers a signed-in reader a way back to the chat', async () => {
    localStorage.setItem('auth_token', 'tok')
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [] }) })

    render(
      <MemoryRouter>
        <SharedView shareId="abc123" />
      </MemoryRouter>
    )

    expect(await screen.findByRole('link', { name: 'Back to chat' })).toHaveAttribute('href', '/chat')
  })

  it('offers no way into the chat to a visitor without a session', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [] }) })

    render(
      <MemoryRouter>
        <SharedView shareId="abc123" />
      </MemoryRouter>
    )

    expect(await screen.findByText('Shared conversation')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to chat' })).not.toBeInTheDocument()
  })
})
