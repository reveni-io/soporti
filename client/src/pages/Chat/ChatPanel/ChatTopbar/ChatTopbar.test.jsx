import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatTopbar from './ChatTopbar.jsx'

const BASE_PROPS = {
  canShare: true,
  isLoading: false,
  onOpenSidebar: vi.fn(),
  onOpenTour: vi.fn(),
  onShare: vi.fn(),
}

describe('ChatTopbar', () => {
  it('opens the sidebar', async () => {
    const onOpenSidebar = vi.fn()
    const user = userEvent.setup()
    render(<ChatTopbar {...BASE_PROPS} onOpenSidebar={onOpenSidebar} />)

    await user.click(screen.getByLabelText('Open sidebar'))

    expect(onOpenSidebar).toHaveBeenCalledTimes(1)
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
})
