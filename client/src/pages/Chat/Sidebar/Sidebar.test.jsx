import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Sidebar from './Sidebar.jsx'

const defaultProps = {
  selectedSources: [],
  onToggleSource: vi.fn(),
  selectedProfile: 'support',
  onSelectProfile: vi.fn(),
  onClearChat: vi.fn(),
  onLogout: vi.fn(),
  token: 'test-token',
  isOpen: false,
  onClose: vi.fn(),
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    global.fetch = vi.fn().mockImplementation(url => {
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
      if (url.includes('/api/integrations')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            integrations: [
              { id: 'github', name: 'GitHub', description: 'Explore repositories', selectable: false },
              { id: 'notion', name: 'Notion', description: 'Search Notion', selectable: true },
            ],
          }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
  })

  it('renders sidebar title', async () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByText('Soporti')).toBeInTheDocument()
  })

  it('renders repos after loading', async () => {
    render(<Sidebar {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('org/app')).toBeInTheDocument()
      expect(screen.getByText('org/lib')).toBeInTheDocument()
    })
  })

  it('calls onToggleSource when a repo source is clicked', async () => {
    const onToggleSource = vi.fn()
    const user = userEvent.setup()
    render(<Sidebar {...defaultProps} onToggleSource={onToggleSource} />)

    await waitFor(() => {
      expect(screen.getByText('org/app')).toBeInTheDocument()
    })

    await user.click(screen.getByText('org/app'))
    expect(onToggleSource).toHaveBeenCalledWith('org/app')
  })

  it('renders profile toggle', async () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /^support$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^tech$/i })).toBeInTheDocument()
  })

  it('calls onClearChat when New Chat clicked', async () => {
    const onClearChat = vi.fn()
    const user = userEvent.setup()
    render(<Sidebar {...defaultProps} onClearChat={onClearChat} />)

    await user.click(screen.getByText(/new chat/i))
    expect(onClearChat).toHaveBeenCalled()
  })

  it('calls onLogout when Logout clicked', async () => {
    const onLogout = vi.fn()
    const user = userEvent.setup()
    render(<Sidebar {...defaultProps} onLogout={onLogout} />)

    await user.click(screen.getByText(/log out/i))
    expect(onLogout).toHaveBeenCalled()
  })

  it('filters repos by search', async () => {
    const user = userEvent.setup()
    render(<Sidebar {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('org/app')).toBeInTheDocument()
    })

    const search = screen.getByPlaceholderText(/search/i)
    await user.type(search, 'lib')

    expect(screen.queryByText('org/app')).not.toBeInTheDocument()
    expect(screen.getByText('org/lib')).toBeInTheDocument()
  })

  it('renders integrations', async () => {
    render(<Sidebar {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Notion')).toBeInTheDocument()
    })
  })

  it('does not offer non-selectable integrations as sources', async () => {
    render(<Sidebar {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Notion')).toBeInTheDocument()
    })
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument()
  })

  it('handles fetch error for repos', async () => {
    global.fetch = vi.fn().mockImplementation(url => {
      if (url.includes('/api/repos')) {
        return Promise.reject(new Error('Network error'))
      }
      return Promise.resolve({ ok: true, json: async () => ({ integrations: [] }) })
    })

    render(<Sidebar {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('handles 401 response by calling onLogout', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockImplementation(url => {
      if (url.includes('/api/repos')) {
        return Promise.resolve({ ok: false, status: 401 })
      }
      return Promise.resolve({ ok: true, json: async () => ({ integrations: [] }) })
    })

    render(<Sidebar {...defaultProps} onLogout={onLogout} />)
    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })

  it('handles non-ok repos response', async () => {
    global.fetch = vi.fn().mockImplementation(url => {
      if (url.includes('/api/repos')) {
        return Promise.resolve({ ok: false, status: 500 })
      }
      return Promise.resolve({ ok: true, json: async () => ({ integrations: [] }) })
    })

    render(<Sidebar {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch repos')).toBeInTheDocument()
    })
  })

  it('shows message when no repos found', async () => {
    global.fetch = vi.fn().mockImplementation(url => {
      if (url.includes('/api/repos')) {
        return Promise.resolve({ ok: true, json: async () => ({ repos: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ integrations: [] }) })
    })

    render(<Sidebar {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText(/no repos found/i)).toBeInTheDocument()
    })
  })

  it('calls onSelectProfile when profile button is clicked', async () => {
    const onSelectProfile = vi.fn()
    const user = userEvent.setup()
    render(<Sidebar {...defaultProps} onSelectProfile={onSelectProfile} />)

    await user.click(screen.getByRole('button', { name: /^tech$/i }))
    expect(onSelectProfile).toHaveBeenCalledWith('tech')
  })

  it('toggles integration selection', async () => {
    const onToggleSource = vi.fn()
    const user = userEvent.setup()
    render(<Sidebar {...defaultProps} onToggleSource={onToggleSource} />)

    await waitFor(() => {
      expect(screen.getByText('Notion')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Notion'))
    expect(onToggleSource).toHaveBeenCalledWith('integration:notion')
  })

  it('shows selected checkmark for selected sources', async () => {
    render(<Sidebar {...defaultProps} selectedSources={['org/app']} />)
    await waitFor(() => {
      expect(screen.getByText('org/app')).toBeInTheDocument()
    })
    const repoItem = screen.getByText('org/app').closest('.sidebar__source')
    expect(repoItem.querySelector('.sidebar__source-check').textContent).toBe('✓')
  })

  it('applies open class when isOpen is true', () => {
    const { container } = render(<Sidebar {...defaultProps} isOpen={true} />)
    expect(container.querySelector('.sidebar--open')).toBeTruthy()
  })

  it('does not apply open class when isOpen is false', () => {
    const { container } = render(<Sidebar {...defaultProps} isOpen={false} />)
    expect(container.querySelector('.sidebar--open')).toBeNull()
  })

  it('shows profile hint for tech profile', () => {
    render(<Sidebar {...defaultProps} selectedProfile="tech" />)
    expect(screen.getByText('Detailed code, architecture, and file paths')).toBeInTheDocument()
  })

  it('shows profile hint for support profile', () => {
    render(<Sidebar {...defaultProps} selectedProfile="support" />)
    expect(screen.getByText('Simplified explanations focused on behavior')).toBeInTheDocument()
  })

  it('shows repo description and language', async () => {
    render(<Sidebar {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Main app')).toBeInTheDocument()
      expect(screen.getByText('JavaScript')).toBeInTheDocument()
    })
  })

  it('filters repos by language', async () => {
    const user = userEvent.setup()
    render(<Sidebar {...defaultProps} />)

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
    render(<Sidebar {...defaultProps} onClose={onClose} isOpen={true} />)

    await user.click(screen.getByLabelText('Close sidebar'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows active class on selected profile button', () => {
    render(<Sidebar {...defaultProps} selectedProfile="tech" />)
    const techBtn = screen.getByRole('button', { name: /^tech$/i })
    expect(techBtn.className).toContain('sidebar__profile-btn--active')
    const supportBtn = screen.getByRole('button', { name: /^support$/i })
    expect(supportBtn.className).not.toContain('sidebar__profile-btn--active')
  })

  describe('conversations history', () => {
    function mockWithConversations(conversations) {
      global.fetch = vi.fn().mockImplementation((url, opts) => {
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
    }

    it('does not render the section when there are no conversations', async () => {
      mockWithConversations([])
      render(<Sidebar {...defaultProps} />)
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
      render(<Sidebar {...defaultProps} onLoadConversation={onLoadConversation} />)

      await waitFor(() => expect(screen.getByText('Auth question')).toBeInTheDocument())
      expect(screen.getByText('Untitled conversation')).toBeInTheDocument()

      await user.click(screen.getByText('Auth question'))
      expect(onLoadConversation).toHaveBeenCalledWith('c1')
    })

    it('deletes a conversation without loading it', async () => {
      mockWithConversations([{ id: 'c1', title: 'Auth question', updatedAt: new Date().toISOString() }])
      const onLoadConversation = vi.fn()
      const user = userEvent.setup()
      render(<Sidebar {...defaultProps} onLoadConversation={onLoadConversation} />)

      await waitFor(() => expect(screen.getByText('Auth question')).toBeInTheDocument())

      await user.click(screen.getByLabelText('Delete conversation'))
      expect(onLoadConversation).not.toHaveBeenCalled()
      await waitFor(() => expect(screen.queryByText('Auth question')).not.toBeInTheDocument())
    })

    it('reloads the list when conversationsReloadKey changes', async () => {
      mockWithConversations([{ id: 'c1', title: 'First', updatedAt: new Date().toISOString() }])
      const { rerender } = render(<Sidebar {...defaultProps} conversationsReloadKey={0} />)
      await waitFor(() => expect(screen.getByText('First')).toBeInTheDocument())

      const convCalls = () => global.fetch.mock.calls.filter(c => String(c[0]).includes('/api/conversations')).length
      const before = convCalls()
      rerender(<Sidebar {...defaultProps} conversationsReloadKey={1} />)
      await waitFor(() => expect(convCalls()).toBeGreaterThan(before))
    })
  })
})
