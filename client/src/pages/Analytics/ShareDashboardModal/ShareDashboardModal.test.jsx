import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ShareDashboardModal from './ShareDashboardModal.jsx'

const DASHBOARD_ID = '5b0c9d1e-2f3a-4b4c-8d5e-6f7a8b9c0d1e'
const LINK = `${window.location.origin}/analytics/${DASHBOARD_ID}`
const PRIVATE = { id: DASHBOARD_ID, name: 'Returns overview', shared: false, isOwner: true, ownerName: 'Ada Lovelace' }
const SHARED = { ...PRIVATE, shared: true }
const SOMEONE_ELSES = { ...SHARED, isOwner: false, ownerName: 'Grace Hopper' }

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })

  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ShareDashboardModal', () => {
  it('offers the owner of a private dashboard to share it, with no link yet', () => {
    render(<ShareDashboardModal dashboard={PRIVATE} onUpdate={vi.fn()} onClose={vi.fn()} />)
    const toggle = screen.getByRole('switch', { name: 'Share with the team' })

    expect(screen.getByRole('dialog', { name: 'Share dashboard' })).toBeInTheDocument()
    expect(toggle).not.toBeChecked()
    expect(toggle).toHaveAccessibleDescription(
      'Everyone signed in to this Soporti can open this dashboard and edit it: add charts, change the SQL, move and delete cards.'
    )
    expect(screen.getByText('Only you can see this dashboard.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Link' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull()
  })

  it('shows the owner of a shared dashboard its link', () => {
    render(<ShareDashboardModal dashboard={SHARED} onUpdate={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('switch', { name: 'Share with the team' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Link' })).toHaveValue(LINK)
    expect(screen.getByRole('textbox', { name: 'Link' })).toHaveAttribute('readonly')
    expect(screen.queryByText('Only you can see this dashboard.')).toBeNull()
  })

  it('selects the whole link when its field takes the focus', async () => {
    const user = userEvent.setup()
    render(<ShareDashboardModal dashboard={SHARED} onUpdate={vi.fn()} onClose={vi.fn()} />)
    const field = screen.getByRole('textbox', { name: 'Link' })

    await user.click(field)

    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe(LINK.length)
  })

  it('copies the link', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<ShareDashboardModal dashboard={SHARED} onUpdate={vi.fn()} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Copy link' }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(LINK)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('shares the dashboard as soon as the switch is turned on', async () => {
    const saving = deferred()
    const onUpdate = vi.fn().mockReturnValue(saving.promise)
    const user = userEvent.setup()
    const { rerender } = render(<ShareDashboardModal dashboard={PRIVATE} onUpdate={onUpdate} onClose={vi.fn()} />)

    await user.click(screen.getByRole('switch', { name: 'Share with the team' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith(DASHBOARD_ID, { shared: true })
    expect(screen.getByRole('switch', { name: 'Share with the team' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Share with the team' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Link' })).toHaveValue(LINK)

    rerender(<ShareDashboardModal dashboard={SHARED} onUpdate={onUpdate} onClose={vi.fn()} />)
    await act(async () => saving.resolve(SHARED))

    expect(screen.getByRole('switch', { name: 'Share with the team' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Share with the team' })).toBeEnabled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('stops sharing the dashboard when the switch is turned off', async () => {
    const onUpdate = vi.fn().mockResolvedValue(PRIVATE)
    const user = userEvent.setup()
    const { rerender } = render(<ShareDashboardModal dashboard={SHARED} onUpdate={onUpdate} onClose={vi.fn()} />)

    await user.click(screen.getByRole('switch', { name: 'Share with the team' }))
    rerender(<ShareDashboardModal dashboard={PRIVATE} onUpdate={onUpdate} onClose={vi.fn()} />)

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith(DASHBOARD_ID, { shared: false })
    expect(screen.getByRole('switch', { name: 'Share with the team' })).not.toBeChecked()
    expect(screen.getByText('Only you can see this dashboard.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Link' })).toBeNull()
  })

  it('puts the switch back and says why when sharing fails', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('Failed to save the dashboard'))
    const user = userEvent.setup()
    render(<ShareDashboardModal dashboard={PRIVATE} onUpdate={onUpdate} onClose={vi.fn()} />)

    await user.click(screen.getByRole('switch', { name: 'Share with the team' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save the dashboard')
    expect(screen.getByRole('switch', { name: 'Share with the team' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Share with the team' })).toBeEnabled()
    expect(screen.getByText('Only you can see this dashboard.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Link' })).toBeNull()
  })

  it('tells a teammate who shared the dashboard and gives them the link, without the switch', () => {
    render(<ShareDashboardModal dashboard={SOMEONE_ELSES} onUpdate={vi.fn()} onClose={vi.fn()} />)

    expect(
      screen.getByText('Shared with the team by Grace Hopper. Everyone signed in can edit it.')
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Link' })).toHaveValue(LINK)
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it.each([['Done'], ['Close']])('closes from the %s button', async name => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<ShareDashboardModal dashboard={SHARED} onUpdate={vi.fn()} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
