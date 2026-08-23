import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Chat from './Chat.jsx'

function shareCalls() {
  return global.fetch.mock.calls.filter(call => String(call[0]).includes('/api/share'))
}

vi.mock('../../hooks/useAuth/useAuth.js', () => ({
  useAuth: vi.fn(),
}))

vi.mock('./hooks/useChat/useChat.js', () => ({
  useChat: vi.fn(),
}))

vi.mock('../../hooks/useAuthMethods/useAuthMethods.js', () => ({
  useAuthMethods: vi.fn(() => ({ google: true, password: true })),
}))

vi.mock('../../hooks/useSkills/useSkills.js', () => ({
  useSkills: vi.fn(() => ({ skills: [], loading: false, error: null, reload: vi.fn() })),
}))

vi.mock('./Sidebar/Sidebar.jsx', () => ({
  default: ({ onClearChat, onLogout, onToggleSource, onSelectProfile, onOpenSchedules, isOpen, onClose }) => (
    <div data-testid="sidebar" data-open={isOpen}>
      <button onClick={onClearChat}>New Chat</button>
      <button onClick={onLogout}>Logout</button>
      <button onClick={() => onToggleSource('org/app')}>Toggle Source</button>
      <button onClick={() => onSelectProfile('tech')}>Set Tech</button>
      <button onClick={onOpenSchedules}>Open Schedules</button>
      <button onClick={onClose}>Close Sidebar</button>
    </div>
  ),
}))

vi.mock('./SchedulesModal/SchedulesModal.jsx', () => ({
  default: ({ selectedSources, selectedProfile, onClose }) => (
    <div data-testid="schedules-modal">
      <span data-testid="schedules-sources">{selectedSources.join(',')}</span>
      <span data-testid="schedules-profile">{selectedProfile}</span>
      <button onClick={onClose}>Close Schedules</button>
    </div>
  ),
}))

vi.mock('./ChatPanel/ChatPanel.jsx', () => ({
  default: ({ messages, onSend, onShare, onOpenSidebar, initialQuestion }) => (
    <div data-testid="chat">
      <span data-testid="msg-count">{messages.length}</span>
      <span data-testid="initial-question">{initialQuestion}</span>
      <button onClick={() => onSend('hello')}>Send</button>
      <button onClick={onShare}>Share</button>
      <button onClick={onOpenSidebar}>Open Sidebar</button>
    </div>
  ),
}))

vi.mock('../../common/Login/Login.jsx', () => ({
  default: ({ onLogin, error }) => (
    <div data-testid="login">
      <button onClick={() => onLogin('google-credential')}>Login</button>
      {error && <span>{error}</span>}
    </div>
  ),
}))

vi.mock('../../common/ShareModal/ShareModal.jsx', () => ({
  default: ({ url, onClose }) => (
    <div data-testid="share-modal">
      <span>{url}</span>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}))

import { useAuth } from '../../hooks/useAuth/useAuth.js'
import { useChat } from './hooks/useChat/useChat.js'

describe('Chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    try {
      localStorage.clear()
    } catch {}
  })

  it('renders Login when not authenticated', () => {
    useAuth.mockReturnValue({
      token: null,
      isAuthenticated: false,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      clearChat: vi.fn(),
    })

    render(<Chat />)
    expect(screen.getByTestId('login')).toBeInTheDocument()
    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument()
  })

  it('renders Sidebar and Chat when authenticated', () => {
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      clearChat: vi.fn(),
    })

    render(<Chat />)
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('chat')).toBeInTheDocument()
    expect(screen.queryByTestId('login')).not.toBeInTheDocument()
  })

  it('hands the chat panel the question it was opened with', () => {
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      clearChat: vi.fn(),
    })

    render(<Chat initialQuestion="why did that refund fail?" />)
    expect(screen.getByTestId('initial-question')).toHaveTextContent('why did that refund fail?')
  })

  it('opens the schedules modal with the selected sources and profile', async () => {
    const user = userEvent.setup()
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      clearChat: vi.fn(),
    })

    render(<Chat />)
    expect(screen.queryByTestId('schedules-modal')).not.toBeInTheDocument()

    await user.click(screen.getByText('Set Tech'))
    await user.click(screen.getByText('Open Schedules'))

    expect(screen.getByTestId('schedules-sources')).toHaveTextContent('yolo')
    expect(screen.getByTestId('schedules-profile')).toHaveTextContent('tech')

    await user.click(screen.getByText('Close Schedules'))

    expect(screen.queryByTestId('schedules-modal')).not.toBeInTheDocument()
  })

  it('shows auth error in Login', () => {
    useAuth.mockReturnValue({
      token: null,
      isAuthenticated: false,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: 'Bad credentials',
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      clearChat: vi.fn(),
    })

    render(<Chat />)
    expect(screen.getByText('Bad credentials')).toBeInTheDocument()
  })

  it('sends message with selected sources and profile', async () => {
    const sendMessage = vi.fn()
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage,
      stopGeneration: vi.fn(),
      clearChat: vi.fn(),
    })

    const user = userEvent.setup()
    render(<Chat />)

    await user.click(screen.getByText('Toggle Source'))
    await user.click(screen.getByText('Send'))

    expect(sendMessage).toHaveBeenCalledWith('hello', ['org/app'], 'support', [], [])
  })

  it('clears chat on New Chat', async () => {
    const clearChat = vi.fn()
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      clearChat,
    })

    const user = userEvent.setup()
    render(<Chat />)
    await user.click(screen.getByText('New Chat'))
    expect(clearChat).toHaveBeenCalled()
  })

  it('shows share modal after sharing', async () => {
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [{ role: 'user', content: 'hi' }],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      clearChat: vi.fn(),
      currentSessionId: { current: 'a3bb189e-8bf9-4888-9912-ace4e6543002' },
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ shareId: 'abc', url: '/share/abc' }),
    })

    const user = userEvent.setup()
    render(<Chat />)
    await user.click(screen.getByText('Share'))

    await waitFor(() => {
      expect(screen.getByTestId('share-modal')).toBeInTheDocument()
    })
  })

  it('stores profile in localStorage when changed', async () => {
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      clearChat: vi.fn(),
    })

    const user = userEvent.setup()
    render(<Chat />)
    await user.click(screen.getByText('Set Tech'))
    expect(localStorage.getItem('selectedProfile')).toBe('tech')
  })

  it('sends message with updated profile after profile change', async () => {
    const sendMessage = vi.fn()
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage,
      stopGeneration: vi.fn(),
      clearChat: vi.fn(),
    })

    const user = userEvent.setup()
    render(<Chat />)
    await user.click(screen.getByText('Set Tech'))
    await user.click(screen.getByText('Send'))
    expect(sendMessage).toHaveBeenCalledWith('hello', ['yolo'], 'tech', [], [])
  })

  it('posts the conversationId on every share', async () => {
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [{ role: 'user', content: 'hi' }],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      clearChat: vi.fn(),
      currentSessionId: { current: 'a3bb189e-8bf9-4888-9912-ace4e6543002' },
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ shareId: 'abc', url: '/share/abc' }),
    })

    const user = userEvent.setup()
    render(<Chat />)

    await user.click(screen.getByText('Share'))
    await waitFor(() => {
      expect(screen.getByTestId('share-modal')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Close'))

    await user.click(screen.getByText('Share'))
    await waitFor(() => {
      expect(shareCalls()).toHaveLength(2)
    })
    for (const call of shareCalls()) {
      const body = JSON.parse(call[1].body)
      expect(body).toEqual({ conversationId: 'a3bb189e-8bf9-4888-9912-ace4e6543002' })
    }
  })

  it('does not call the share endpoint when no conversation exists yet', async () => {
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [{ role: 'user', content: 'hi' }],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      clearChat: vi.fn(),
      currentSessionId: { current: null },
    })

    global.fetch = vi.fn()

    const user = userEvent.setup()
    render(<Chat />)
    await user.click(screen.getByText('Share'))

    expect(shareCalls()).toHaveLength(0)
    expect(screen.queryByTestId('share-modal')).not.toBeInTheDocument()
  })

  it('handles share error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [{ role: 'user', content: 'hi' }],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      clearChat: vi.fn(),
      currentSessionId: { current: 'a3bb189e-8bf9-4888-9912-ace4e6543002' },
    })

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    const user = userEvent.setup()
    render(<Chat />)
    await user.click(screen.getByText('Share'))

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    expect(screen.queryByTestId('share-modal')).not.toBeInTheDocument()
    consoleSpy.mockRestore()
  })

  it('opens sidebar overlay when Open Sidebar is clicked', async () => {
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      clearChat: vi.fn(),
    })

    const user = userEvent.setup()
    const { container } = render(<Chat />)
    await user.click(screen.getByText('Open Sidebar'))

    expect(container.querySelector('.chat-page__overlay')).toBeTruthy()
    expect(screen.getByTestId('sidebar').dataset.open).toBe('true')
  })

  it('closes sidebar when Close Sidebar button is clicked', async () => {
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      clearChat: vi.fn(),
    })

    const user = userEvent.setup()
    const { container } = render(<Chat />)

    await user.click(screen.getByText('Open Sidebar'))
    expect(container.querySelector('.chat-page__overlay')).toBeTruthy()

    await user.click(screen.getByText('Close Sidebar'))
    expect(container.querySelector('.chat-page__overlay')).toBeNull()
    expect(screen.getByTestId('sidebar').dataset.open).toBe('false')
  })

  it('closes sidebar when overlay is clicked', async () => {
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      clearChat: vi.fn(),
    })

    const user = userEvent.setup()
    const { container } = render(<Chat />)

    await user.click(screen.getByText('Open Sidebar'))
    const overlay = container.querySelector('.chat-page__overlay')
    expect(overlay).toBeTruthy()

    await user.click(overlay)
    expect(container.querySelector('.chat-page__overlay')).toBeNull()
    expect(screen.getByTestId('sidebar').dataset.open).toBe('false')
  })
})
