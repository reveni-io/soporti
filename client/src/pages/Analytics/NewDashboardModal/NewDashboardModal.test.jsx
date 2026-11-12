import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewDashboardModal from './NewDashboardModal.jsx'

describe('NewDashboardModal', () => {
  it('asks for the name of the dashboard, ready to type', () => {
    render(<NewDashboardModal onCreate={vi.fn()} onClose={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: 'Name' })

    expect(screen.getByRole('dialog', { name: 'New dashboard' })).toBeInTheDocument()
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('placeholder', 'e.g. Returns overview')
    expect(input).toHaveAttribute('maxlength', '80')
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  })

  it('creates the dashboard with its name and closes', async () => {
    const onCreate = vi.fn().mockResolvedValue()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<NewDashboardModal onCreate={onCreate} onClose={onClose} />)

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Returns overview')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledWith('Returns overview')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows the limit the server enforces and stays open', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('You already have 20 dashboards.'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<NewDashboardModal onCreate={onCreate} onClose={onClose} />)

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'One more{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('You already have 20 dashboards.')
    expect(onClose).not.toHaveBeenCalled()
  })

  it.each([['Cancel'], ['Close']])('closes from the %s button without creating', async name => {
    const onCreate = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<NewDashboardModal onCreate={onCreate} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onCreate).not.toHaveBeenCalled()
  })
})
