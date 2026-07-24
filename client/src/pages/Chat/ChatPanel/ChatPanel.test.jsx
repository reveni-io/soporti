import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatPanel from './ChatPanel.jsx'

vi.mock('../../../common/Message/Message.jsx', () => ({
  default: ({ message }) => <div data-testid="message">{message.content || 'assistant'}</div>,
}))

const defaultProps = {
  messages: [],
  isLoading: false,
  onSend: vi.fn(),
  onStop: vi.fn(),
  hasSourcesSelected: true,
  onOpenSidebar: vi.fn(),
  onShare: vi.fn(),
  token: 'test-token',
}

describe('ChatPanel', () => {
  function mockApi({ stats } = {}) {
    global.fetch = vi.fn(url =>
      Promise.resolve({
        ok: true,
        json: async () =>
          String(url).includes('/api/stats')
            ? { stats: stats ?? null }
            : {
                integrations: [
                  { id: 'github', name: 'GitHub', description: 'Explore repositories', selectable: false },
                  { id: 'notion', name: 'Notion', description: 'Search Notion', selectable: true },
                  { id: 'sentry', name: 'Sentry', description: 'Inspect errors', selectable: false },
                ],
              },
      })
    )
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.setItem('soportiTourSeen', '1')
    mockApi()
  })

  it('renders empty state when no messages', () => {
    render(<ChatPanel {...defaultProps} />)
    expect(screen.getByText('Soporti')).toBeInTheDocument()
    expect(screen.getByText('Ask Soporti anything')).toBeInTheDocument()
  })

  it('shows configured integrations in the empty state', async () => {
    render(<ChatPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument()
    })
    expect(screen.getByText('Notion')).toBeInTheDocument()
    expect(screen.getByText('Sentry')).toBeInTheDocument()
  })

  it('renders no integration chips when the fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    const { container } = render(<ChatPanel {...defaultProps} />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container.querySelector('.chat__capabilities')).toBeNull()
    expect(screen.getByText('Ask Soporti anything')).toBeInTheDocument()
  })

  describe('example questions', () => {
    it('shows a sample of example questions for the configured integrations', async () => {
      const { container } = render(<ChatPanel {...defaultProps} />)
      await waitFor(() => {
        expect(container.querySelectorAll('.chat__examples button')).toHaveLength(4)
      })
    })

    it('fills the input instead of sending when an example is clicked', async () => {
      const onSend = vi.fn()
      const user = userEvent.setup()
      const { container } = render(<ChatPanel {...defaultProps} onSend={onSend} />)

      await waitFor(() => {
        expect(container.querySelectorAll('.chat__examples button').length).toBeGreaterThan(0)
      })
      const example = container.querySelector('.chat__examples button')
      await user.click(example)

      expect(onSend).not.toHaveBeenCalled()
      expect(screen.getByPlaceholderText(/ask/i)).toHaveValue(example.textContent)
    })

    it('still shows untagged examples when the integrations fetch fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
      render(<ChatPanel {...defaultProps} />)
      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(screen.getByText('What tools and data do you have access to?')).toBeInTheDocument()
    })
  })

  describe('stats', () => {
    it('shows stat tiles in the empty state', async () => {
      mockApi({ stats: { windowDays: 7, conversations: 128, activeUsers: 9, solvedCases: 12900 } })
      render(<ChatPanel {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Conversations this week')).toBeInTheDocument()
      })
      expect(screen.getByText('128')).toBeInTheDocument()
      expect(screen.getByText('Teammates this week')).toBeInTheDocument()
      expect(screen.getByText('9')).toBeInTheDocument()
      expect(screen.getByText('12.9K')).toBeInTheDocument()
    })

    it('hides tiles whose value is zero or unavailable', async () => {
      mockApi({ stats: { windowDays: 7, conversations: 0, activeUsers: null, solvedCases: 96 } })
      render(<ChatPanel {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Solved cases learned')).toBeInTheDocument()
      })
      expect(screen.queryByText('Conversations this week')).not.toBeInTheDocument()
      expect(screen.queryByText('Teammates this week')).not.toBeInTheDocument()
    })

    it('hides the stats row when the fetch fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
      const { container } = render(<ChatPanel {...defaultProps} />)
      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(container.querySelector('.chat__stats')).toBeNull()
    })
  })

  it('renders messages', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', parts: [{ type: 'text', content: 'Hi' }] },
    ]
    render(<ChatPanel {...defaultProps} messages={messages} />)
    expect(screen.getAllByTestId('message')).toHaveLength(2)
  })

  it('sends message on Enter', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<ChatPanel {...defaultProps} onSend={onSend} />)

    const textarea = screen.getByPlaceholderText(/ask/i)
    await user.type(textarea, 'Hello world')
    await user.keyboard('{Enter}')

    expect(onSend).toHaveBeenCalledWith('Hello world')
  })

  it('does not send empty message', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<ChatPanel {...defaultProps} onSend={onSend} />)

    const textarea = screen.getByPlaceholderText(/ask/i)
    await user.click(textarea)
    await user.keyboard('{Enter}')

    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows share button when messages exist', () => {
    const messages = [{ role: 'user', content: 'Hi' }]
    render(<ChatPanel {...defaultProps} messages={messages} />)
    expect(screen.getByTitle(/share/i)).toBeInTheDocument()
  })

  it('disables input when no sources selected', () => {
    render(<ChatPanel {...defaultProps} hasSourcesSelected={false} />)
    const textarea = screen.getByPlaceholderText(/select/i)
    expect(textarea).toBeDisabled()
  })

  describe('tour', () => {
    it('auto-opens on first visit and remembers it was seen', async () => {
      localStorage.removeItem('soportiTourSeen')
      const user = userEvent.setup()
      render(<ChatPanel {...defaultProps} />)

      expect(screen.getByText('Meet Soporti')).toBeInTheDocument()

      await user.click(screen.getByLabelText('Close tour'))
      expect(screen.queryByText('Meet Soporti')).not.toBeInTheDocument()
      expect(localStorage.getItem('soportiTourSeen')).toBe('1')
    })

    it('does not auto-open when already seen', () => {
      render(<ChatPanel {...defaultProps} />)
      expect(screen.queryByText('Meet Soporti')).not.toBeInTheDocument()
    })

    it('opens from the topbar button', async () => {
      const user = userEvent.setup()
      render(<ChatPanel {...defaultProps} />)

      await user.click(screen.getByText('What can I ask?'))
      expect(screen.getByText('Meet Soporti')).toBeInTheDocument()
    })

    it('fills the input when a tour example is clicked', async () => {
      const user = userEvent.setup()
      render(<ChatPanel {...defaultProps} />)

      await user.click(screen.getByText('What can I ask?'))
      for (let i = 0; i < 10 && !screen.queryByText('Ask how the product works'); i++) {
        await user.click(screen.getByText('Next'))
      }

      const example = 'How are webhook deliveries retried when the receiving server is down?'
      await user.click(within(screen.getByRole('dialog')).getByText(example))
      expect(screen.queryByText('Ask how the product works')).not.toBeInTheDocument()
      expect(screen.getByPlaceholderText(/ask/i)).toHaveValue(example)
    })
  })
})
