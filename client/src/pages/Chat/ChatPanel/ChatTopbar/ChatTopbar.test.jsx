import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
})
