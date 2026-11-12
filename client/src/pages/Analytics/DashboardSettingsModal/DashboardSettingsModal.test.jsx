import { describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DashboardSettingsModal from './DashboardSettingsModal.jsx'

const DASHBOARD = {
  id: '5b0c9d1e-2f3a-4b4c-8d5e-6f7a8b9c0d1e',
  name: 'Returns overview',
  shared: false,
  isOwner: true,
  ownerName: 'Ada Lovelace',
}

function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })

  return { promise, resolve }
}

describe('DashboardSettingsModal', () => {
  it('starts from the name of the dashboard, with nothing to save yet', () => {
    render(<DashboardSettingsModal dashboard={DASHBOARD} onRename={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Dashboard settings' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Returns overview')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('renames the dashboard and closes', async () => {
    const onRename = vi.fn().mockResolvedValue()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<DashboardSettingsModal dashboard={DASHBOARD} onRename={onRename} onDelete={vi.fn()} onClose={onClose} />)

    await user.clear(screen.getByRole('textbox', { name: 'Name' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Refunds')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onRename).toHaveBeenCalledWith('Refunds')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cannot save an empty name', async () => {
    const user = userEvent.setup()
    render(<DashboardSettingsModal dashboard={DASHBOARD} onRename={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />)

    await user.clear(screen.getByRole('textbox', { name: 'Name' }))

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('shows why the name could not be saved and stays open', async () => {
    const onRename = vi.fn().mockRejectedValue(new Error('The name must have between 1 and 80 characters.'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<DashboardSettingsModal dashboard={DASHBOARD} onRename={onRename} onDelete={vi.fn()} onClose={onClose} />)

    await user.type(screen.getByRole('textbox', { name: 'Name' }), ' 2{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('The name must have between 1 and 80 characters.')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('asks before deleting the dashboard and its charts', async () => {
    const onDelete = vi.fn().mockResolvedValue()
    const user = userEvent.setup()
    render(<DashboardSettingsModal dashboard={DASHBOARD} onRename={vi.fn()} onDelete={onDelete} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Delete dashboard' }))

    expect(screen.getByRole('group', { name: 'Delete this dashboard and its charts?' })).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('keeps the dashboard when the deletion is not confirmed', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(<DashboardSettingsModal dashboard={DASHBOARD} onRename={vi.fn()} onDelete={onDelete} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Delete dashboard' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete dashboard' })).toBeInTheDocument()
  })

  it('cannot confirm twice while the dashboard is being deleted', async () => {
    const deletion = deferred()
    const onDelete = vi.fn().mockReturnValue(deletion.promise)
    const user = userEvent.setup()
    render(<DashboardSettingsModal dashboard={DASHBOARD} onRename={vi.fn()} onDelete={onDelete} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Delete dashboard' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(screen.getByRole('button', { name: 'Yes, delete' })).toBeDisabled()

    await act(async () => deletion.resolve())
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('shows why the dashboard could not be deleted', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('Failed to delete the dashboard'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<DashboardSettingsModal dashboard={DASHBOARD} onRename={vi.fn()} onDelete={onDelete} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Delete dashboard' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to delete the dashboard')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes from its close button without changing anything', async () => {
    const onRename = vi.fn()
    const onDelete = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<DashboardSettingsModal dashboard={DASHBOARD} onRename={onRename} onDelete={onDelete} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onRename).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })
})
