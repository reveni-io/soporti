import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
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
  default: ({
    onNewChat,
    onLogout,
    onToggleSource,
    onSelectProfile,
    onOpenSchedules,
    isOpen,
    isCollapsed,
    onClose,
    onCollapse,
    user,
    activeConversations,
    conversationsReloadKey,
    selectedConversationId,
    hasUnreadBots,
    onLoadConversation,
  }) => (
    <div data-testid="sidebar" data-open={isOpen} data-collapsed={isCollapsed}>
      <span data-testid="has-unread-bots">{String(hasUnreadBots)}</span>
      <button onClick={() => onLoadConversation('conv-1')}>Load Conversation</button>
      <span data-testid="sidebar-user">{user?.email}</span>
      <span data-testid="active-conversations">{JSON.stringify(activeConversations)}</span>
      <span data-testid="conversations-reload-key">{conversationsReloadKey}</span>
      <span data-testid="selected-conversation">{selectedConversationId}</span>
      <button onClick={onNewChat}>New Chat</button>
      <button onClick={onLogout}>Logout</button>
      <button onClick={() => onToggleSource('org/app')}>Toggle Source</button>
      <button onClick={() => onSelectProfile('tech')}>Set Tech</button>
      <button onClick={onOpenSchedules}>Open Schedules</button>
      <button onClick={onClose}>Close Sidebar</button>
      <button onClick={onCollapse}>Collapse Sidebar</button>
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
  default: ({
    messages,
    onSend,
    onShare,
    onOpenSidebar,
    isSidebarCollapsed,
    onExpandSidebar,
    initialQuestion,
    bot,
    onOpenRoutines,
    onEditBot,
    onBackToBots,
  }) => (
    <div data-testid="chat" data-sidebar-collapsed={isSidebarCollapsed}>
      <span data-testid="chat-bot">{bot?.name}</span>
      <button onClick={onOpenRoutines}>Open Routines</button>
      <button onClick={onEditBot}>Edit Bot</button>
      <button onClick={onBackToBots}>Back To Bots</button>
      <span data-testid="msg-count">{messages.length}</span>
      <span data-testid="initial-question">{initialQuestion}</span>
      <button onClick={() => onSend('hello')}>Send</button>
      <button onClick={onShare}>Share</button>
      <button onClick={onOpenSidebar}>Open Sidebar</button>
      <button onClick={onExpandSidebar}>Expand Sidebar</button>
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
      newChat: vi.fn(),
    })

    render(<Chat />, { wrapper: MemoryRouter })
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
      newChat: vi.fn(),
    })

    render(<Chat />, { wrapper: MemoryRouter })
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
      newChat: vi.fn(),
    })

    render(<Chat initialQuestion="why did that refund fail?" />, { wrapper: MemoryRouter })
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
      newChat: vi.fn(),
    })

    render(<Chat />, { wrapper: MemoryRouter })
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
      newChat: vi.fn(),
    })

    render(<Chat />, { wrapper: MemoryRouter })
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
      newChat: vi.fn(),
    })

    const user = userEvent.setup()
    render(<Chat />, { wrapper: MemoryRouter })

    await user.click(screen.getByText('Toggle Source'))
    await user.click(screen.getByText('Send'))

    expect(sendMessage).toHaveBeenCalledWith('hello', {
      selectedSources: ['org/app'],
      profile: 'support',
      skills: [],
      attachments: [],
    })
  })

  it('starts a new chat on New Chat', async () => {
    const newChat = vi.fn()
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
      newChat,
    })

    const user = userEvent.setup()
    render(<Chat />, { wrapper: MemoryRouter })
    await user.click(screen.getByText('New Chat'))
    expect(newChat).toHaveBeenCalled()
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
      newChat: vi.fn(),
      sessionId: 'a3bb189e-8bf9-4888-9912-ace4e6543002',
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ shareId: 'abc', url: '/share/abc' }),
    })

    const user = userEvent.setup()
    render(<Chat />, { wrapper: MemoryRouter })
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
      newChat: vi.fn(),
    })

    const user = userEvent.setup()
    render(<Chat />, { wrapper: MemoryRouter })
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
      newChat: vi.fn(),
    })

    const user = userEvent.setup()
    render(<Chat />, { wrapper: MemoryRouter })
    await user.click(screen.getByText('Set Tech'))
    await user.click(screen.getByText('Send'))
    expect(sendMessage).toHaveBeenCalledWith('hello', {
      selectedSources: ['yolo'],
      profile: 'tech',
      skills: [],
      attachments: [],
    })
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
      newChat: vi.fn(),
      sessionId: 'a3bb189e-8bf9-4888-9912-ace4e6543002',
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ shareId: 'abc', url: '/share/abc' }),
    })

    const user = userEvent.setup()
    render(<Chat />, { wrapper: MemoryRouter })

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
      newChat: vi.fn(),
      sessionId: null,
    })

    global.fetch = vi.fn()

    const user = userEvent.setup()
    render(<Chat />, { wrapper: MemoryRouter })
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
      newChat: vi.fn(),
      sessionId: 'a3bb189e-8bf9-4888-9912-ace4e6543002',
    })

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    const user = userEvent.setup()
    render(<Chat />, { wrapper: MemoryRouter })
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
      newChat: vi.fn(),
    })

    const user = userEvent.setup()
    const { container } = render(<Chat />, { wrapper: MemoryRouter })
    expect(container.querySelector('.chat-page__overlay--visible')).toBeNull()

    await user.click(screen.getByText('Open Sidebar'))

    expect(container.querySelector('.chat-page__overlay--visible')).toBeTruthy()
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
      newChat: vi.fn(),
    })

    const user = userEvent.setup()
    const { container } = render(<Chat />, { wrapper: MemoryRouter })

    await user.click(screen.getByText('Open Sidebar'))
    expect(container.querySelector('.chat-page__overlay--visible')).toBeTruthy()

    await user.click(screen.getByText('Close Sidebar'))
    expect(container.querySelector('.chat-page__overlay--visible')).toBeNull()
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
      newChat: vi.fn(),
    })

    const user = userEvent.setup()
    const { container } = render(<Chat />, { wrapper: MemoryRouter })

    await user.click(screen.getByText('Open Sidebar'))
    const overlay = container.querySelector('.chat-page__overlay--visible')
    expect(overlay).toBeTruthy()

    await user.click(overlay)
    expect(container.querySelector('.chat-page__overlay--visible')).toBeNull()
    expect(screen.getByTestId('sidebar').dataset.open).toBe('false')
  })
  it('collapses the sidebar and remembers it', async () => {
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
      newChat: vi.fn(),
    })

    const user = userEvent.setup()
    render(<Chat />, { wrapper: MemoryRouter })

    expect(screen.getByTestId('sidebar').dataset.collapsed).toBe('false')

    await user.click(screen.getByText('Collapse Sidebar'))

    expect(screen.getByTestId('sidebar').dataset.collapsed).toBe('true')
    expect(screen.getByTestId('chat').dataset.sidebarCollapsed).toBe('true')
    expect(localStorage.getItem('sidebarCollapsed')).toBe('true')
  })

  it('expands the collapsed sidebar from the chat panel', async () => {
    localStorage.setItem('sidebarCollapsed', 'true')
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
      newChat: vi.fn(),
    })

    const user = userEvent.setup()
    render(<Chat />, { wrapper: MemoryRouter })

    expect(screen.getByTestId('sidebar').dataset.collapsed).toBe('true')

    await user.click(screen.getByText('Expand Sidebar'))

    expect(screen.getByTestId('sidebar').dataset.collapsed).toBe('false')
    expect(screen.getByTestId('chat').dataset.sidebarCollapsed).toBe('false')
    expect(localStorage.getItem('sidebarCollapsed')).toBe('false')
  })

  it('tells the sidebar who is signed in', () => {
    useAuth.mockReturnValue({
      token: 'tok',
      user: { name: 'Ada Lovelace', email: 'ada@example.com' },
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
      newChat: vi.fn(),
    })

    render(<Chat />, { wrapper: MemoryRouter })

    expect(screen.getByTestId('sidebar-user').textContent).toBe('ada@example.com')
  })

  it('feeds the sidebar every in-flight conversation', () => {
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    const activeConversations = [
      { id: 'a3bb189e-8bf9-4888-9912-ace4e6543002', title: 'Why did the payout fail?', isStreaming: true },
      { id: 'b4cc290f-9cf0-4999-8823-bdf5f7654113', title: 'How does auth work?', isStreaming: false },
    ]
    useChat.mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      newChat: vi.fn(),
      activeConversations,
      completedRuns: 0,
      sessionId: null,
    })

    render(<Chat />, { wrapper: MemoryRouter })

    expect(JSON.parse(screen.getByTestId('active-conversations').textContent)).toEqual(activeConversations)
  })

  it('tells the sidebar which conversation is on screen', () => {
    useAuth.mockReturnValue({
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    })
    useChat.mockReturnValue({
      messages: [{ role: 'user', content: 'Why did the payout fail?' }],
      isLoading: false,
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      newChat: vi.fn(),
      activeConversations: [],
      completedRuns: 0,
      sessionId: 'a3bb189e-8bf9-4888-9912-ace4e6543002',
    })

    render(<Chat />, { wrapper: MemoryRouter })

    expect(screen.getByTestId('selected-conversation').textContent).toBe('a3bb189e-8bf9-4888-9912-ace4e6543002')
  })

  it('refreshes the conversation list every time a run finishes', () => {
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
      newChat: vi.fn(),
      activeConversations: [],
      completedRuns: 3,
      sessionId: null,
    })

    render(<Chat />, { wrapper: MemoryRouter })

    expect(screen.getByTestId('conversations-reload-key').textContent).toBe('3')
  })

  describe('bots', () => {
    const SIGNED_IN = {
      token: 'tok',
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      error: null,
      isLoggingIn: false,
    }
    const TRIAGER = {
      id: 3,
      name: 'Ticket triager',
      description: 'Reviews the new tickets.',
      profile: 'tech',
      avatarSeed: 'seed-3',
      unreadCount: 0,
    }
    const RELEASES = {
      id: 4,
      name: 'Release notes',
      description: 'Writes the release notes.',
      profile: 'support',
      avatarSeed: 'seed-4',
      unreadCount: 0,
    }

    function respond(body, status = 200) {
      return { ok: status < 400, status, json: async () => body }
    }

    function chatState(overrides = {}) {
      return {
        messages: [],
        isLoading: false,
        sendMessage: vi.fn(),
        stopGeneration: vi.fn(),
        newChat: vi.fn(),
        loadConversation: vi.fn().mockResolvedValue(),
        openBot: vi.fn().mockResolvedValue(),
        refreshBot: vi.fn().mockResolvedValue(),
        activeConversations: [],
        busyBotIds: [],
        completedRuns: 0,
        sessionId: 'a3bb189e-8bf9-4888-9912-ace4e6543002',
        ...overrides,
      }
    }

    function serveBots(initialBots) {
      let bots = initialBots
      global.fetch = vi.fn().mockImplementation((url, options) => {
        const path = String(url)
        if (path === '/api/bots' && options.method === 'POST') {
          const created = { ...TRIAGER, ...JSON.parse(options.body), id: 8 }
          bots = [...bots, created]
          return Promise.resolve(respond({ bot: created }, 201))
        }
        if (path.startsWith('/api/bots/') && options.method === 'DELETE') {
          bots = []
          return Promise.resolve(respond({ ok: true }))
        }
        if (path === '/api/bots') return Promise.resolve(respond({ bots }))
        if (path.endsWith('/routines')) return Promise.resolve(respond({ routines: [] }))
        return Promise.resolve(respond({ ok: true }))
      })
    }

    function LocationProbe() {
      return <span data-testid="location">{useLocation().pathname}</span>
    }

    it('lists the bots and asks to pick one at /bots', async () => {
      serveBots([TRIAGER])
      useAuth.mockReturnValue(SIGNED_IN)
      useChat.mockReturnValue(chatState())

      render(
        <MemoryRouter initialEntries={['/bots']}>
          <Chat />
        </MemoryRouter>
      )

      expect(await screen.findByRole('link', { name: /ticket triager/i })).toHaveAttribute('href', '/bots/3')
      expect(screen.getByRole('heading', { name: 'Pick a bot' })).toBeInTheDocument()
      expect(screen.queryByTestId('chat')).not.toBeInTheDocument()
    })

    it('opens the chat of the bot at /bots/:botId and marks it read', async () => {
      serveBots([TRIAGER])
      const state = chatState()
      useAuth.mockReturnValue(SIGNED_IN)
      useChat.mockReturnValue(state)

      render(
        <MemoryRouter initialEntries={['/bots/3']}>
          <Chat />
        </MemoryRouter>
      )

      expect(await screen.findByTestId('chat-bot')).toHaveTextContent('Ticket triager')
      expect(screen.getByRole('link', { name: /ticket triager/i })).toHaveAttribute('aria-current', 'page')
      expect(useChat.mock.lastCall[3]).toBe(3)
      expect(state.openBot).toHaveBeenCalledWith(3)
      await waitFor(() =>
        expect(
          global.fetch.mock.calls.some(([url, options]) => url === '/api/bots/3/read' && options.method === 'POST')
        ).toBe(true)
      )
      expect(screen.getByTestId('selected-conversation')).toBeEmptyDOMElement()
    })

    it('says the bot was not found when it is not one of the bots of the user', async () => {
      serveBots([TRIAGER])
      useAuth.mockReturnValue(SIGNED_IN)
      useChat.mockReturnValue(chatState())

      render(
        <MemoryRouter initialEntries={['/bots/99']}>
          <Chat />
        </MemoryRouter>
      )

      expect(await screen.findByRole('heading', { name: 'Bot not found.' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /ticket triager/i })).not.toHaveAttribute('aria-current')
      expect(screen.queryByTestId('chat')).not.toBeInTheDocument()
    })

    it('sends the messages of a bot with every tool and the profile of the bot', async () => {
      serveBots([TRIAGER])
      const state = chatState()
      useAuth.mockReturnValue(SIGNED_IN)
      useChat.mockReturnValue(state)
      const user = userEvent.setup()

      render(
        <MemoryRouter initialEntries={['/bots/3']}>
          <Chat />
        </MemoryRouter>
      )
      expect(await screen.findByTestId('chat-bot')).toHaveTextContent('Ticket triager')
      await user.click(screen.getByText('Send'))

      expect(state.sendMessage).toHaveBeenCalledTimes(1)
      expect(state.sendMessage).toHaveBeenCalledWith('hello', {
        selectedSources: ['yolo'],
        profile: 'tech',
        skills: [],
        attachments: [],
      })
    })

    it('switches to another bot from the list while the chat stays beside it', async () => {
      serveBots([TRIAGER, RELEASES])
      const state = chatState()
      useAuth.mockReturnValue(SIGNED_IN)
      useChat.mockReturnValue(state)
      const user = userEvent.setup()

      render(
        <MemoryRouter initialEntries={['/bots/3']}>
          <Chat />
          <LocationProbe />
        </MemoryRouter>
      )
      expect(await screen.findByTestId('chat-bot')).toHaveTextContent('Ticket triager')
      await user.click(screen.getByRole('link', { name: /release notes/i }))

      expect(screen.getByTestId('location')).toHaveTextContent('/bots/4')
      expect(screen.getByTestId('chat-bot')).toHaveTextContent('Release notes')
      expect(screen.getByRole('link', { name: /release notes/i })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('link', { name: /ticket triager/i })).toBeInTheDocument()
      expect(useChat.mock.lastCall[3]).toBe(4)
      expect(state.openBot).toHaveBeenLastCalledWith(4)
    })

    it('shows in the list which bots are still answering', async () => {
      serveBots([TRIAGER, RELEASES])
      useAuth.mockReturnValue(SIGNED_IN)
      useChat.mockReturnValue(chatState({ busyBotIds: [3] }))

      render(
        <MemoryRouter initialEntries={['/bots/4']}>
          <Chat />
        </MemoryRouter>
      )

      expect(await screen.findByRole('link', { name: /ticket triager/i })).toHaveTextContent('Thinking…')
      expect(screen.getByRole('link', { name: /release notes/i })).not.toHaveTextContent('Thinking…')
    })

    it('goes back to the list from the chat of a bot', async () => {
      serveBots([TRIAGER])
      useAuth.mockReturnValue(SIGNED_IN)
      useChat.mockReturnValue(chatState())
      const user = userEvent.setup()

      render(
        <MemoryRouter initialEntries={['/bots/3']}>
          <Chat />
          <LocationProbe />
        </MemoryRouter>
      )
      expect(await screen.findByTestId('chat-bot')).toHaveTextContent('Ticket triager')
      await user.click(screen.getByText('Back To Bots'))

      expect(screen.getByTestId('location')).toHaveTextContent(/^\/bots$/)
      expect(screen.getByRole('heading', { name: 'Pick a bot' })).toBeInTheDocument()
      expect(screen.queryByTestId('chat')).not.toBeInTheDocument()
    })

    it('marks the bots link while a bot has something new', async () => {
      serveBots([{ ...TRIAGER, unreadCount: 2 }])
      useAuth.mockReturnValue(SIGNED_IN)
      useChat.mockReturnValue(chatState())

      render(<Chat />, { wrapper: MemoryRouter })

      await waitFor(() => expect(screen.getByTestId('has-unread-bots')).toHaveTextContent('true'))
    })

    it('goes back to the chat when a new chat starts from a bot', async () => {
      serveBots([TRIAGER])
      const state = chatState()
      useAuth.mockReturnValue(SIGNED_IN)
      useChat.mockReturnValue(state)
      const user = userEvent.setup()

      render(
        <MemoryRouter initialEntries={['/bots/3']}>
          <Chat />
          <LocationProbe />
        </MemoryRouter>
      )
      expect(await screen.findByTestId('chat-bot')).toHaveTextContent('Ticket triager')
      await user.click(screen.getByText('New Chat'))

      expect(state.newChat).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('location')).toHaveTextContent('/chat')
    })

    it('goes back to the chat to open a conversation from a bot', async () => {
      serveBots([TRIAGER])
      const state = chatState()
      useAuth.mockReturnValue(SIGNED_IN)
      useChat.mockReturnValue(state)
      const user = userEvent.setup()

      render(
        <MemoryRouter initialEntries={['/bots/3']}>
          <Chat />
          <LocationProbe />
        </MemoryRouter>
      )
      await user.click(screen.getByText('Load Conversation'))

      expect(state.loadConversation).toHaveBeenCalledWith('conv-1')
      expect(screen.getByTestId('location')).toHaveTextContent('/chat')
    })

    it('creates a bot and opens its chat', async () => {
      serveBots([])
      useAuth.mockReturnValue(SIGNED_IN)
      useChat.mockReturnValue(chatState())
      const user = userEvent.setup()

      render(
        <MemoryRouter initialEntries={['/bots']}>
          <Chat />
          <LocationProbe />
        </MemoryRouter>
      )
      await user.click(await screen.findByRole('button', { name: 'Create a bot' }))
      await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Release notes')
      await user.type(screen.getByRole('textbox', { name: 'What is it for?' }), 'Writes the release notes.')
      await user.click(screen.getByRole('button', { name: 'Create bot' }))

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/bots/8'))
      expect(screen.getByTestId('chat-bot')).toHaveTextContent('Release notes')
      expect(screen.queryByRole('dialog', { name: 'New bot' })).not.toBeInTheDocument()
    })

    it('opens the routines of the bot', async () => {
      serveBots([TRIAGER])
      useAuth.mockReturnValue(SIGNED_IN)
      useChat.mockReturnValue(chatState())
      const user = userEvent.setup()

      render(
        <MemoryRouter initialEntries={['/bots/3']}>
          <Chat />
        </MemoryRouter>
      )
      expect(await screen.findByTestId('chat-bot')).toHaveTextContent('Ticket triager')
      await user.click(screen.getByText('Open Routines'))

      expect(screen.getByRole('dialog', { name: 'Routines' })).toBeInTheDocument()
      expect(await screen.findByText(/No routines yet/)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Close' }))

      expect(screen.queryByRole('dialog', { name: 'Routines' })).not.toBeInTheDocument()
    })

    it('edits the bot from its chat', async () => {
      serveBots([TRIAGER])
      useAuth.mockReturnValue(SIGNED_IN)
      useChat.mockReturnValue(chatState())
      const user = userEvent.setup()

      render(
        <MemoryRouter initialEntries={['/bots/3']}>
          <Chat />
        </MemoryRouter>
      )
      expect(await screen.findByTestId('chat-bot')).toHaveTextContent('Ticket triager')
      await user.click(screen.getByText('Edit Bot'))

      expect(screen.getByRole('dialog', { name: 'Edit bot' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Ticket triager')

      await user.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit bot' })).not.toBeInTheDocument())
      expect(global.fetch.mock.calls.some(([url, options]) => url === '/api/bots/3' && options.method === 'PUT')).toBe(
        true
      )
    })

    it('returns to the bots once the bot is deleted', async () => {
      serveBots([TRIAGER])
      useAuth.mockReturnValue(SIGNED_IN)
      useChat.mockReturnValue(chatState())
      const user = userEvent.setup()

      render(
        <MemoryRouter initialEntries={['/bots/3']}>
          <Chat />
          <LocationProbe />
        </MemoryRouter>
      )
      expect(await screen.findByTestId('chat-bot')).toHaveTextContent('Ticket triager')
      await user.click(screen.getByText('Edit Bot'))
      await user.click(screen.getByRole('button', { name: 'Delete bot' }))
      await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/bots$/))
      expect(await screen.findByRole('heading', { name: 'Your own assistants' })).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'Edit bot' })).not.toBeInTheDocument()
    })
  })
})
