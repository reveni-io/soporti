import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { palette } from 'blobatar'
import ChatTopbar from './ChatTopbar.jsx'

const BASE_PROPS = {
  title: 'Why did the payout fail?',
  canShare: true,
  isLoading: false,
  isSidebarCollapsed: false,
  onOpenSidebar: vi.fn(),
  onExpandSidebar: vi.fn(),
  onOpenTour: vi.fn(),
  onShare: vi.fn(),
}

describe('ChatTopbar', () => {
  it('shows the title of the conversation', () => {
    render(<ChatTopbar {...BASE_PROPS} />)

    expect(screen.getByRole('heading', { name: 'Why did the payout fail?' })).toBeInTheDocument()
  })

  it('opens the sidebar', async () => {
    const onOpenSidebar = vi.fn()
    const user = userEvent.setup()
    render(<ChatTopbar {...BASE_PROPS} onOpenSidebar={onOpenSidebar} />)

    await user.click(screen.getByLabelText('Open sidebar'))

    expect(onOpenSidebar).toHaveBeenCalledTimes(1)
  })

  it('expands the collapsed sidebar', async () => {
    const onExpandSidebar = vi.fn()
    const user = userEvent.setup()
    render(<ChatTopbar {...BASE_PROPS} isSidebarCollapsed onExpandSidebar={onExpandSidebar} />)

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }))

    expect(onExpandSidebar).toHaveBeenCalledTimes(1)
  })

  it('offers no expand button while the sidebar is expanded', () => {
    render(<ChatTopbar {...BASE_PROPS} isSidebarCollapsed={false} />)

    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).not.toBeInTheDocument()
  })

  it('opens the tour', async () => {
    const onOpenTour = vi.fn()
    const user = userEvent.setup()
    render(<ChatTopbar {...BASE_PROPS} onOpenTour={onOpenTour} />)

    await user.click(screen.getByRole('button', { name: /what can i ask/i }))

    expect(onOpenTour).toHaveBeenCalledTimes(1)
  })

  it('shares the conversation', async () => {
    const onShare = vi.fn()
    const user = userEvent.setup()
    render(<ChatTopbar {...BASE_PROPS} onShare={onShare} />)

    await user.click(screen.getByLabelText('Share conversation'))

    expect(onShare).toHaveBeenCalledTimes(1)
  })

  it('hides the share button when sharing is not available', () => {
    render(<ChatTopbar {...BASE_PROPS} canShare={false} />)

    expect(screen.queryByLabelText('Share conversation')).not.toBeInTheDocument()
  })

  it('disables sharing while a response is streaming', () => {
    render(<ChatTopbar {...BASE_PROPS} isLoading />)

    expect(screen.getByLabelText('Share conversation')).toBeDisabled()
  })

  it('marks the conversation as live while a response is streaming', () => {
    const { container } = render(<ChatTopbar {...BASE_PROPS} isLoading />)

    expect(container.querySelector('.chat-topbar__live')).toBeInTheDocument()
  })

  it('shows no live mark while idle', () => {
    const { container } = render(<ChatTopbar {...BASE_PROPS} isLoading={false} />)

    expect(container.querySelector('.chat-topbar__live')).toBeNull()
  })

  describe('bot mode', () => {
    const BOT = { id: 3, name: 'Ticket triager', description: 'Reviews the new tickets.', avatarSeed: 'seed-3' }

    it('shows the name and description of the bot instead of a title', () => {
      const { container } = render(<ChatTopbar {...BASE_PROPS} bot={BOT} />)

      expect(screen.getByRole('heading', { name: 'Ticket triager' })).toBeInTheDocument()
      expect(screen.getByText('Reviews the new tickets.')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Why did the payout fail?' })).not.toBeInTheDocument()
      expect(container.querySelector('svg.bot-avatar')).toBeInTheDocument()
    })

    it('wears the avatar style of the bot and a thinking face while it answers', () => {
      const styled = { ...BOT, avatarStyle: { hue: 270, tone: 'deep', mood: 'neutral' } }
      const { container: idle } = render(<ChatTopbar {...BASE_PROPS} bot={styled} />)
      const { container: busy } = render(<ChatTopbar {...BASE_PROPS} bot={styled} isLoading />)

      const avatar = idle.querySelector('svg.bot-avatar')
      expect(avatar.style.getPropertyValue('--mo-head')).toBe(palette(270, true, 0.71).head)
      expect(avatar.querySelector('g')).toHaveClass('mo-always')
      expect(avatar.querySelector('g')).not.toHaveClass('mo-expr')
      expect(busy.querySelector('svg.bot-avatar > g')).toHaveClass('mo-expr')
    })

    it('offers the routines and the bot settings instead of the tour and sharing', () => {
      render(<ChatTopbar {...BASE_PROPS} bot={BOT} />)

      expect(screen.getByRole('button', { name: 'Routines' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit bot' })).toBeInTheDocument()
      expect(screen.queryByLabelText('Share conversation')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /what can i ask/i })).not.toBeInTheDocument()
    })

    it('opens the routines', async () => {
      const onOpenRoutines = vi.fn()
      const user = userEvent.setup()
      render(<ChatTopbar {...BASE_PROPS} bot={BOT} onOpenRoutines={onOpenRoutines} />)

      await user.click(screen.getByRole('button', { name: 'Routines' }))

      expect(onOpenRoutines).toHaveBeenCalledTimes(1)
    })

    it('edits the bot', async () => {
      const onEditBot = vi.fn()
      const user = userEvent.setup()
      render(<ChatTopbar {...BASE_PROPS} bot={BOT} onEditBot={onEditBot} />)

      await user.click(screen.getByRole('button', { name: 'Edit bot' }))

      expect(onEditBot).toHaveBeenCalledTimes(1)
    })
  })
})
