import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'

const defaultProps = {
  selectedSources: [],
  onToggleSource: vi.fn(),
  selectedProfile: 'support',
  onSelectProfile: vi.fn(),
  onNewChat: vi.fn(),
  onLogout: vi.fn(),
  integrations: [
    { id: 'github', name: 'GitHub', description: 'Explore repositories', selectable: false },
    { id: 'notion', name: 'Notion', description: 'Search Notion', selectable: true },
  ],
  token: 'test-token',
  isOpen: false,
  onClose: vi.fn(),
}

const NO_VIDEOS = { videos: [] }

function withVideos(respond, videos = NO_VIDEOS) {
  return (url, options) => {
    if (url === '/api/videos') return Promise.resolve({ ok: true, status: 200, json: async () => videos })
    return respond(url, options)
  }
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    global.fetch = vi.fn().mockImplementation(
      withVideos(url => {
        if (url.includes('/api/repos')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              repos: [
                { fullName: 'org/app', description: 'Main app', language: 'JavaScript' },
                { fullName: 'org/lib', description: 'Library', language: 'TypeScript' },
              ],
            }),
          })
        }
        return Promise.resolve({ ok: true, json: async () => ({}) })
      })
    )
  })

  it('links to the videos and marks it while a video is being generated', async () => {
    const generating = { videos: [{ id: 'v1', title: 'Launch', status: 'running', phase: 'composing', progress: 20 }] }
    global.fetch = vi.fn().mockImplementation(withVideos(global.fetch.getMockImplementation(), generating))

    render(<Sidebar {...defaultProps} />, { wrapper: MemoryRouter })

    expect(screen.getByRole('link', { name: 'Videos' })).toHaveAttribute('href', '/videos')
    expect(await screen.findByRole('img', { name: 'A video is being generated' })).toBeInTheDocument()
    expect(global.fetch.mock.calls.filter(([url]) => url === '/api/videos')).toHaveLength(1)
  })

  it('shows no mark when no video is being generated', async () => {
    render(<Sidebar {...defaultProps} />, { wrapper: MemoryRouter })

    await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => url === '/api/videos')).toBe(true))
    expect(screen.queryByRole('img', { name: 'A video is being generated' })).toBeNull()
  })

  it('renders sidebar title', async () => {
    render(<Sidebar {...defaultProps} />, { wrapper: MemoryRouter })
    expect(screen.getByText('Soporti')).toBeInTheDocument()
  })

  it('renders repos after loading', async () => {
    render(<Sidebar {...defaultProps} />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('org/app')).toBeInTheDocument()
      expect(screen.getByText('org/lib')).toBeInTheDocument()
    })
  })

  it('calls onToggleSource when a repo source is clicked', async () => {
    const onToggleSource = vi.fn()
    const user = userEvent.setup()
    render(<Sidebar {...defaultProps} onToggleSource={onToggleSource} />, { wrapper: MemoryRouter })

    await waitFor(() => {
      expect(screen.getByText('org/app')).toBeInTheDocument()
    })

    await user.click(screen.getByText('org/app'))
    expect(onToggleSource).toHaveBeenCalledWith('org/app')
  })

  it('renders profile toggle', async () => {
    render(<Sidebar {...defaultProps} />, { wrapper: MemoryRouter })
    expect(screen.getByRole('button', { name: /^support$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^tech$/i })).toBeInTheDocument()
  })

  it('calls onNewChat when New Chat clicked', async () => {
    const onNewChat = vi.fn()
    const user = userEvent.setup()
    render(<Sidebar {...defaultProps} onNewChat={onNewChat} />, { wrapper: MemoryRouter })

    await user.click(screen.getByText(/new chat/i))
    expect(onNewChat).toHaveBeenCalled()
  })

  it('calls onLogout when Logout clicked', async () => {
    const onLogout = vi.fn()
    const user = userEvent.setup()
    render(<Sidebar {...defaultProps} onLogout={onLogout} />, { wrapper: MemoryRouter })

    await user.click(screen.getByText(/log out/i))
    expect(onLogout).toHaveBeenCalled()
  })

  it('filters repos by search', async () => {
    const user = userEvent.setup()
    render(<Sidebar {...defaultProps} />, { wrapper: MemoryRouter })

    await waitFor(() => {
      expect(screen.getByText('org/app')).toBeInTheDocument()
    })

    const search = screen.getByPlaceholderText(/search/i)
    await user.type(search, 'lib')

    expect(screen.queryByText('org/app')).not.toBeInTheDocument()
    expect(screen.getByText('org/lib')).toBeInTheDocument()
  })

  it('renders integrations', async () => {
    render(<Sidebar {...defaultProps} />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('Notion')).toBeInTheDocument()
    })
  })

  it('does not offer non-selectable integrations as sources', async () => {
    render(<Sidebar {...defaultProps} />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('Notion')).toBeInTheDocument()
    })
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument()
  })

  it('handles fetch error for repos', async () => {
    global.fetch = vi.fn().mockImplementation(
      withVideos(url => {
        if (url.includes('/api/repos')) {
          return Promise.reject(new Error('Network error'))
        }
        return Promise.resolve({ ok: true, json: async () => ({ integrations: [] }) })
      })
    )

    render(<Sidebar {...defaultProps} />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('handles 401 response by calling onLogout', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockImplementation(
      withVideos(url => {
        if (url.includes('/api/repos')) {
          return Promise.resolve({ ok: false, status: 401 })
        }
        return Promise.resolve({ ok: true, json: async () => ({ integrations: [] }) })
      })
    )

    render(<Sidebar {...defaultProps} onLogout={onLogout} />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })

  it('handles non-ok repos response', async () => {
    global.fetch = vi.fn().mockImplementation(
      withVideos(url => {
        if (url.includes('/api/repos')) {
          return Promise.resolve({ ok: false, status: 500 })
        }
        return Promise.resolve({ ok: true, json: async () => ({ integrations: [] }) })
      })
    )

    render(<Sidebar {...defaultProps} />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch repos')).toBeInTheDocument()
    })
  })

  it('shows message when no repos found', async () => {
    global.fetch = vi.fn().mockImplementation(
      withVideos(url => {
        if (url.includes('/api/repos')) {
          return Promise.resolve({ ok: true, json: async () => ({ repos: [] }) })
        }
        return Promise.resolve({ ok: true, json: async () => ({ integrations: [] }) })
      })
    )

    render(<Sidebar {...defaultProps} />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText(/no repos found/i)).toBeInTheDocument()
    })
  })

  it('calls onSelectProfile when profile button is clicked', async () => {
    const onSelectProfile = vi.fn()
    const user = userEvent.setup()
    render(<Sidebar {...defaultProps} onSelectProfile={onSelectProfile} />, { wrapper: MemoryRouter })

    await user.click(screen.getByRole('button', { name: /^tech$/i }))
    expect(onSelectProfile).toHaveBeenCalledWith('tech')
  })

  it('toggles integration selection', async () => {
    const onToggleSource = vi.fn()
    const user = userEvent.setup()
    render(<Sidebar {...defaultProps} onToggleSource={onToggleSource} />, { wrapper: MemoryRouter })

    await waitFor(() => {
      expect(screen.getByText('Notion')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Notion'))
    expect(onToggleSource).toHaveBeenCalledWith('integration:notion')
  })

  it('shows selected checkmark for selected sources', async () => {
    render(<Sidebar {...defaultProps} selectedSources={['org/app']} />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('org/app')).toBeInTheDocument()
    })
    const repoItem = screen.getByText('org/app').closest('.sidebar__source')
    expect(repoItem.querySelector('.sidebar__source-check').textContent).toBe('✓')
  })

  it('applies open class when isOpen is true', () => {
    const { container } = render(<Sidebar {...defaultProps} isOpen={true} />, { wrapper: MemoryRouter })
    expect(container.querySelector('.sidebar--open')).toBeTruthy()
  })

  it('does not apply open class when isOpen is false', () => {
    const { container } = render(<Sidebar {...defaultProps} isOpen={false} />, { wrapper: MemoryRouter })
    expect(container.querySelector('.sidebar--open')).toBeNull()
  })

  it('shows profile hint for tech profile', () => {
    render(<Sidebar {...defaultProps} selectedProfile="tech" />, { wrapper: MemoryRouter })
    expect(screen.getByText('Detailed code, architecture, and file paths')).toBeInTheDocument()
  })

  it('shows profile hint for support profile', () => {
    render(<Sidebar {...defaultProps} selectedProfile="support" />, { wrapper: MemoryRouter })
    expect(screen.getByText('Simplified explanations focused on behavior')).toBeInTheDocument()
  })

  it('shows repo description and language', async () => {
    render(<Sidebar {...defaultProps} />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('Main app')).toBeInTheDocument()
      expect(screen.getByText('JavaScript')).toBeInTheDocument()
    })
  })

  it('filters repos by language', async () => {
    const user = userEvent.setup()
    render(<Sidebar {...defaultProps} />, { wrapper: MemoryRouter })

    await waitFor(() => {
      expect(screen.getByText('org/app')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/search/i)
    await user.type(searchInput, 'typescript')

    expect(screen.queryByText('org/app')).not.toBeInTheDocument()
    expect(screen.getByText('org/lib')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Sidebar {...defaultProps} onClose={onClose} isOpen={true} />, { wrapper: MemoryRouter })

    await user.click(screen.getByLabelText('Close sidebar'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows active class on selected profile button', () => {
    render(<Sidebar {...defaultProps} selectedProfile="tech" />, { wrapper: MemoryRouter })
    const techBtn = screen.getByRole('button', { name: /^tech$/i })
    expect(techBtn.className).toContain('sidebar__profile-btn--active')
    const supportBtn = screen.getByRole('button', { name: /^support$/i })
    expect(supportBtn.className).not.toContain('sidebar__profile-btn--active')
  })

  describe('conversations history', () => {
    function mockWithConversations(conversations) {
      global.fetch = vi.fn().mockImplementation(
        withVideos((url, opts) => {
          if (url.includes('/api/conversations') && opts?.method === 'DELETE') {
            return Promise.resolve({ ok: true, json: async () => ({ ok: true }) })
          }
          if (url.includes('/api/conversations')) {
            return Promise.resolve({ ok: true, json: async () => ({ conversations }) })
          }
          if (url.includes('/api/repos')) {
            return Promise.resolve({ ok: true, json: async () => ({ repos: [] }) })
          }
          return Promise.resolve({ ok: true, json: async () => ({ integrations: [] }) })
        })
      )
    }

    it('does not render the section when there are no conversations', async () => {
      mockWithConversations([])
      render(<Sidebar {...defaultProps} />, { wrapper: MemoryRouter })
      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(screen.queryByText('Conversations')).not.toBeInTheDocument()
    })

    it('lists conversations and loads one on click', async () => {
      mockWithConversations([
        { id: 'c1', title: 'Auth question', updatedAt: new Date().toISOString() },
        { id: 'c2', title: null, updatedAt: new Date().toISOString() },
      ])
      const onLoadConversation = vi.fn()
      const user = userEvent.setup()
      render(<Sidebar {...defaultProps} onLoadConversation={onLoadConversation} />, { wrapper: MemoryRouter })

      await waitFor(() => expect(screen.getByText('Auth question')).toBeInTheDocument())
      expect(screen.getByText('Untitled conversation')).toBeInTheDocument()

      await user.click(screen.getByText('Auth question'))
      expect(onLoadConversation).toHaveBeenCalledWith('c1')
    })

    it('deletes a conversation without loading it', async () => {
      mockWithConversations([{ id: 'c1', title: 'Auth question', updatedAt: new Date().toISOString() }])
      const onLoadConversation = vi.fn()
      const user = userEvent.setup()
      render(<Sidebar {...defaultProps} onLoadConversation={onLoadConversation} />, { wrapper: MemoryRouter })

      await waitFor(() => expect(screen.getByText('Auth question')).toBeInTheDocument())

      await user.click(screen.getByLabelText('Delete conversation'))
      expect(onLoadConversation).not.toHaveBeenCalled()
      await waitFor(() => expect(screen.queryByText('Auth question')).not.toBeInTheDocument())
    })

    it('shows the in-flight conversation the server list does not have yet', async () => {
      mockWithConversations([{ id: 'c1', title: 'Auth question', updatedAt: new Date().toISOString() }])
      render(
        <Sidebar
          {...defaultProps}
          activeConversations={[{ id: 'c2', title: 'Why did the payout fail?', isStreaming: true }]}
        />,
        { wrapper: MemoryRouter }
      )

      await waitFor(() => expect(screen.getByText('Why did the payout fail?')).toBeInTheDocument())
      expect(screen.getByLabelText('Answering')).toBeInTheDocument()
      expect(screen.getByText('Auth question')).toBeInTheDocument()
    })

    it('shows the conversations section for an in-flight conversation on an empty server list', async () => {
      mockWithConversations([])
      render(
        <Sidebar
          {...defaultProps}
          activeConversations={[{ id: 'c2', title: 'Why did the payout fail?', isStreaming: true }]}
        />,
        { wrapper: MemoryRouter }
      )

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(screen.getByText('Conversations')).toBeInTheDocument()
      expect(screen.getByText('Why did the payout fail?')).toBeInTheDocument()
    })

    it('does not duplicate the in-flight conversation once the server list has it', async () => {
      mockWithConversations([{ id: 'c1', title: 'Payout failure', updatedAt: new Date().toISOString() }])
      render(
        <Sidebar {...defaultProps} activeConversations={[{ id: 'c1', title: 'Payout failure', isStreaming: true }]} />,
        { wrapper: MemoryRouter }
      )

      await waitFor(() => expect(screen.getByText('Payout failure')).toBeInTheDocument())
      expect(screen.getAllByText('Payout failure')).toHaveLength(1)
      expect(screen.getByLabelText('Answering')).toBeInTheDocument()
    })

    it('marks every in-flight conversation at once', async () => {
      mockWithConversations([{ id: 'c1', title: 'Auth question', updatedAt: new Date().toISOString() }])
      render(
        <Sidebar
          {...defaultProps}
          activeConversations={[
            { id: 'c2', title: 'Why did the payout fail?', isStreaming: true },
            { id: 'c1', title: 'Auth question', isStreaming: true },
          ]}
        />,
        { wrapper: MemoryRouter }
      )

      await waitFor(() => expect(screen.getByText('Why did the payout fail?')).toBeInTheDocument())
      expect(screen.getByText('Auth question')).toBeInTheDocument()
      expect(screen.getAllByLabelText('Answering')).toHaveLength(2)
    })

    it('marks the conversation the reader is on', async () => {
      mockWithConversations([
        { id: 'c1', title: 'Auth question', updatedAt: new Date().toISOString() },
        { id: 'c2', title: 'Payout failure', updatedAt: new Date().toISOString() },
      ])
      const { container } = render(<Sidebar {...defaultProps} selectedConversationId="c2" />, { wrapper: MemoryRouter })

      await waitFor(() => expect(screen.getByText('Payout failure')).toBeInTheDocument())

      const current = container.querySelectorAll('[aria-current="true"]')
      expect(current).toHaveLength(1)
      expect(current[0]).toHaveTextContent('Payout failure')
    })

    it('reloads the list when conversationsReloadKey changes', async () => {
      mockWithConversations([{ id: 'c1', title: 'First', updatedAt: new Date().toISOString() }])
      const { rerender } = render(<Sidebar {...defaultProps} conversationsReloadKey={0} />, { wrapper: MemoryRouter })
      await waitFor(() => expect(screen.getByText('First')).toBeInTheDocument())

      const convCalls = () => global.fetch.mock.calls.filter(c => String(c[0]).includes('/api/conversations')).length
      const before = convCalls()
      rerender(<Sidebar {...defaultProps} conversationsReloadKey={1} />)
      await waitFor(() => expect(convCalls()).toBeGreaterThan(before))
    })

    it('searches the conversations and restores the full list when the search is cleared', async () => {
      global.fetch = vi.fn().mockImplementation(
        withVideos(url => {
          if (url.includes('/api/conversations?q=refund')) {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                conversations: [{ id: 'c2', title: 'Vague title', snippet: 'we checked the refund window' }],
              }),
            })
          }
          if (url.includes('/api/conversations')) {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                conversations: [
                  { id: 'c1', title: 'Auth question' },
                  { id: 'c2', title: 'Vague title' },
                ],
              }),
            })
          }
          return Promise.resolve({ ok: true, json: async () => ({ repos: [] }) })
        })
      )
      const user = userEvent.setup()
      render(<Sidebar {...defaultProps} />, { wrapper: MemoryRouter })
      await waitFor(() => expect(screen.getByText('Auth question')).toBeInTheDocument())

      const searchBox = screen.getByRole('textbox', { name: 'Search conversations' })
      await user.type(searchBox, 'refund')

      await waitFor(() => expect(screen.queryByText('Auth question')).not.toBeInTheDocument())
      expect(screen.getByText('Vague title')).toBeInTheDocument()
      expect(screen.getByText('refund', { selector: 'mark' })).toBeInTheDocument()

      await user.clear(searchBox)

      await waitFor(() => expect(screen.getByText('Auth question')).toBeInTheDocument())
      expect(screen.queryByText('refund', { selector: 'mark' })).not.toBeInTheDocument()
    })
  })
})
