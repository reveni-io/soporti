import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatPanel from './ChatPanel.jsx'

vi.mock('../../../common/Message/Message.jsx', () => ({
  default: ({ message }) => <div data-testid="message">{message.content || 'assistant'}</div>,
}))

const INTEGRATIONS = [
  { id: 'github', name: 'GitHub', description: 'Explore repositories', selectable: false },
  { id: 'notion', name: 'Notion', description: 'Search Notion', selectable: true },
  { id: 'sentry', name: 'Sentry', description: 'Inspect errors', selectable: false },
]

const defaultProps = {
  messages: [],
  isLoading: false,
  onSend: vi.fn(),
  onStop: vi.fn(),
  hasSourcesSelected: true,
  onOpenSidebar: vi.fn(),
  onShare: vi.fn(),
  integrations: INTEGRATIONS,
  token: 'test-token',
}

describe('ChatPanel', () => {
  function mockApi({ stats, attachment } = {}) {
    global.fetch = vi.fn(url => {
      const u = String(url)
      if (u.includes('/api/stats')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ stats: stats ?? null }) })
      }
      if (u.includes('/api/attachments')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ attachment }) })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          integrations: [
            { id: 'github', name: 'GitHub', description: 'Explore repositories', selectable: false },
            { id: 'notion', name: 'Notion', description: 'Search Notion', selectable: true },
            { id: 'sentry', name: 'Sentry', description: 'Inspect errors', selectable: false },
          ],
        }),
      })
    })
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

  it('renders no integration chips when there are no integrations', () => {
    const { container } = render(<ChatPanel {...defaultProps} integrations={[]} />)
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

    expect(onSend).toHaveBeenCalledWith('Hello world', [], [])
  })

  it('uploads an attached file, sends it with the message and empties the composer', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    const attachment = { name: 'spec.pdf', text: 'API body', truncated: false }
    mockApi({ attachment })
    render(<ChatPanel {...defaultProps} onSend={onSend} />)

    await user.upload(
      screen.getByLabelText('Attach files'),
      new File(['%PDF-1.4'], 'spec.pdf', { type: 'application/pdf' })
    )
    await screen.findByText(/spec\.pdf/)

    await user.type(screen.getByPlaceholderText(/ask/i), 'summarize it')
    await user.keyboard('{Enter}')

    expect(onSend).toHaveBeenCalledWith('summarize it', [], [attachment])
    expect(screen.queryByText(/spec\.pdf/)).not.toBeInTheDocument()
  })

  it('refuses to send while an attachment is still uploading', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    let resolveUpload
    global.fetch = vi.fn(url => {
      if (String(url).includes('/api/attachments')) return new Promise(resolve => (resolveUpload = resolve))
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ stats: null }) })
    })
    render(<ChatPanel {...defaultProps} onSend={onSend} />)

    await user.upload(
      screen.getByLabelText('Attach files'),
      new File(['%PDF-1.4'], 'spec.pdf', { type: 'application/pdf' })
    )
    await user.type(screen.getByPlaceholderText(/ask/i), 'summarize it')
    await user.keyboard('{Enter}')

    expect(onSend).not.toHaveBeenCalled()

    await act(async () => {
      resolveUpload({
        ok: true,
        status: 200,
        json: async () => ({ attachment: { name: 'spec.pdf', text: 'API body', truncated: false } }),
      })
    })
    await user.keyboard('{Enter}')

    expect(onSend).toHaveBeenCalledWith('summarize it', [], [{ name: 'spec.pdf', text: 'API body', truncated: false }])
  })

  it('drops a staged attachment when the conversation changes', async () => {
    const user = userEvent.setup()
    mockApi({ attachment: { name: 'spec.pdf', text: 'API body', truncated: false } })
    const { rerender } = render(<ChatPanel {...defaultProps} conversationKey={0} />)

    await user.upload(
      screen.getByLabelText('Attach files'),
      new File(['%PDF-1.4'], 'spec.pdf', { type: 'application/pdf' })
    )
    await screen.findByText(/spec\.pdf/)

    rerender(<ChatPanel {...defaultProps} conversationKey={1} />)

    expect(screen.queryByText(/spec\.pdf/)).not.toBeInTheDocument()
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

  describe('skill autocomplete', () => {
    const SKILLS = [
      { id: 1, name: 'bug-triage', description: 'Ask for repro steps' },
      { id: 2, name: 'bug-report', description: 'Draft a bug report' },
      { id: 3, name: 'refund-policy', description: null },
    ]

    it('does not open the menu when the user has no skills', async () => {
      const user = userEvent.setup()
      render(<ChatPanel {...defaultProps} skills={[]} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, '/')

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('opens the menu and lists all skills on a bare "/"', async () => {
      const user = userEvent.setup()
      render(<ChatPanel {...defaultProps} skills={SKILLS} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, '/')

      expect(screen.getByRole('listbox')).toBeInTheDocument()
      expect(screen.getAllByRole('option')).toHaveLength(3)
    })

    it('filters skills by the typed prefix', async () => {
      const user = userEvent.setup()
      render(<ChatPanel {...defaultProps} skills={SKILLS} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, '/bug-t')

      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(1)
      expect(options[0]).toHaveTextContent('bug-triage')
    })

    it('shows a "no matching skills" state when nothing matches', async () => {
      const user = userEvent.setup()
      render(<ChatPanel {...defaultProps} skills={SKILLS} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, '/zzz')

      expect(screen.getByText('No matching skills')).toBeInTheDocument()
    })

    it('sends the literal text on Enter when nothing matches', async () => {
      const onSend = vi.fn()
      const user = userEvent.setup()
      render(<ChatPanel {...defaultProps} onSend={onSend} skills={SKILLS} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, '/zzz')
      expect(screen.getByText('No matching skills')).toBeInTheDocument()

      await user.keyboard('{Enter}')

      expect(onSend).toHaveBeenCalledWith('/zzz', [], [])
    })

    it('closes the menu once the input no longer matches a bare slash command', async () => {
      const user = userEvent.setup()
      render(<ChatPanel {...defaultProps} skills={SKILLS} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, '/bug-triage')
      expect(screen.getByRole('listbox')).toBeInTheDocument()

      await user.type(textarea, ' please help')
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('selects a skill by clicking it, completing the command in the input and highlighting it', async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatPanel {...defaultProps} skills={SKILLS} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, '/bug-t')
      await user.click(screen.getByText(/bug-triage/))

      expect(textarea).toHaveValue('/bug-triage ')
      expect(container.querySelector('.chat__input-command')).toHaveTextContent('/bug-triage')
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

      await user.clear(textarea)
      expect(container.querySelector('.chat__input-command')).toBeNull()
    })

    it('navigates with arrow keys and selects the highlighted skill with Enter', async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatPanel {...defaultProps} skills={SKILLS} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, '/bug')
      expect(screen.getAllByRole('option')).toHaveLength(2)

      await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')

      expect(container.querySelector('.chat__input-command')).toHaveTextContent('/bug-report')
      expect(textarea).toHaveValue('/bug-report ')
    })

    it('closes the menu on Escape without changing the input', async () => {
      const user = userEvent.setup()
      render(<ChatPanel {...defaultProps} skills={SKILLS} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, '/bug-t')
      expect(screen.getByRole('listbox')).toBeInTheDocument()

      await user.keyboard('{Escape}')

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      expect(textarea).toHaveValue('/bug-t')
    })

    it('sends the invoked skill id on submit, stripping the command, and resets after sending', async () => {
      const onSend = vi.fn()
      const user = userEvent.setup()
      const { container } = render(<ChatPanel {...defaultProps} onSend={onSend} skills={SKILLS} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, '/bug-t')
      await user.click(screen.getByText(/bug-triage/))
      await user.type(textarea, 'my question')
      await user.keyboard('{Enter}')

      expect(onSend).toHaveBeenCalledWith('my question', [{ id: 1, name: 'bug-triage' }], [])
      expect(textarea).toHaveValue('')
      expect(container.querySelector('.chat__input-command')).toBeNull()
    })

    it('invokes a skill typed manually as a full command with a message', async () => {
      const onSend = vi.fn()
      const user = userEvent.setup()
      const { container } = render(<ChatPanel {...defaultProps} onSend={onSend} skills={SKILLS} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, '/bug-triage Alert component')

      expect(container.querySelector('.chat__input-command')).toHaveTextContent('/bug-triage')
      expect(container.querySelector('.chat__input-highlight').textContent).toBe('/bug-triage Alert component')

      await user.keyboard('{Enter}')

      expect(onSend).toHaveBeenCalledWith('Alert component', [{ id: 1, name: 'bug-triage' }], [])
    })

    it('does not highlight an unknown command', async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatPanel {...defaultProps} skills={SKILLS} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, '/zzz hello')

      expect(container.querySelector('.chat__input-highlight')).toBeNull()
      expect(textarea).not.toHaveClass('chat__input--overlaid')
    })

    it('does not send when only the command is typed', async () => {
      const onSend = vi.fn()
      const user = userEvent.setup()
      render(<ChatPanel {...defaultProps} onSend={onSend} skills={SKILLS} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, '/bug-triage ')
      await user.keyboard('{Enter}')

      expect(onSend).not.toHaveBeenCalled()
      expect(screen.getByTitle('Send')).toBeDisabled()
    })

    it('sends an unknown command literally without a skill', async () => {
      const onSend = vi.fn()
      const user = userEvent.setup()
      render(<ChatPanel {...defaultProps} onSend={onSend} skills={SKILLS} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, '/zzz hello')
      await user.keyboard('{Enter}')

      expect(onSend).toHaveBeenCalledWith('/zzz hello', [], [])
    })

    it('picks up skills that arrive after mount', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<ChatPanel {...defaultProps} skills={[]} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, '/')
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

      rerender(<ChatPanel {...defaultProps} skills={[{ id: 1, name: 'bug-triage', description: null }]} />)

      expect(screen.getByRole('listbox')).toBeInTheDocument()
      expect(screen.getByText(/bug-triage/)).toBeInTheDocument()
    })

    it('sends an empty skill list when no skill is attached', async () => {
      const onSend = vi.fn()
      const user = userEvent.setup()
      render(<ChatPanel {...defaultProps} onSend={onSend} skills={SKILLS} />)

      const textarea = screen.getByPlaceholderText(/ask/i)
      await user.type(textarea, 'just a question')
      await user.keyboard('{Enter}')

      expect(onSend).toHaveBeenCalledWith('just a question', [], [])
    })
  })

  describe('scrolling', () => {
    function stubViewportMetrics(viewport) {
      Object.defineProperty(viewport, 'scrollHeight', { configurable: true, get: () => 1000 })
      Object.defineProperty(viewport, 'clientHeight', { configurable: true, get: () => 300 })
    }

    it('scrolls back to the bottom when another conversation is opened after scrolling up', async () => {
      const { container, rerender } = render(
        <ChatPanel {...defaultProps} messages={[{ role: 'user', content: 'first' }]} conversationKey={1} />
      )

      const viewport = container.querySelector('.chat__messages')
      stubViewportMetrics(viewport)
      viewport.scrollTop = 0
      fireEvent.scroll(viewport)

      rerender(
        <ChatPanel {...defaultProps} messages={[{ role: 'user', content: 'another one' }]} conversationKey={2} />
      )

      await waitFor(() => expect(viewport.scrollTop).toBe(1000))
    })
  })
})
