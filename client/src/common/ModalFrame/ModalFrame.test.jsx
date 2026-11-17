import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModalFrame from './ModalFrame.jsx'

describe('ModalFrame', () => {
  it('frames its content in a dialog named after its title', () => {
    render(
      <ModalFrame title="Share dashboard" className="share-dashboard-modal" onClose={vi.fn()}>
        <p>Only you can see this dashboard.</p>
      </ModalFrame>
    )
    const dialog = screen.getByRole('dialog', { name: 'Share dashboard' })

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveClass('modal', 'share-dashboard-modal')
    expect(screen.getByRole('heading', { name: 'Share dashboard' })).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Only you can see this dashboard.')
  })

  it('closes from its close button', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <ModalFrame title="New dashboard" className="new-dashboard-modal" onClose={onClose}>
        <p>Content</p>
      </ModalFrame>
    )

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <ModalFrame title="New dashboard" className="new-dashboard-modal" onClose={onClose}>
        <p>Content</p>
      </ModalFrame>
    )

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the overlay is pressed but not when the dialog is', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <ModalFrame title="New dashboard" className="new-dashboard-modal" onClose={onClose}>
        <p>Content</p>
      </ModalFrame>
    )

    await user.click(screen.getByRole('dialog', { name: 'New dashboard' }))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(container.querySelector('.modal-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
