import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VariantModal from './VariantModal.jsx'

describe('VariantModal', () => {
  it('sends the trimmed change and closes once it is accepted', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(true)
    const onClose = vi.fn()
    render(<VariantModal busy={false} onClose={onClose} onSubmit={onSubmit} />)

    await user.type(screen.getByRole('textbox', { name: 'What should change?' }), '  Brand it for Acme  ')
    await user.click(screen.getByRole('button', { name: 'Create variant' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('Brand it for Acme')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open when the variant is refused', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<VariantModal busy={false} onClose={onClose} onSubmit={vi.fn().mockResolvedValue(false)} />)

    await user.type(screen.getByRole('textbox', { name: 'What should change?' }), 'Shorter')
    await user.click(screen.getByRole('button', { name: 'Create variant' }))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('needs a change and an idle studio before it can be sent', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<VariantModal busy={false} onClose={vi.fn()} onSubmit={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Create variant' })).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: 'What should change?' }), 'Shorter')
    rerender(<VariantModal busy={true} onClose={vi.fn()} onSubmit={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Create variant' })).toBeDisabled()
  })

  it('closes with Escape or the close button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<VariantModal busy={false} onClose={onClose} onSubmit={vi.fn()} />)

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
