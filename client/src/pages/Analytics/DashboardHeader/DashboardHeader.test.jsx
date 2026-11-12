import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import DashboardHeader from './DashboardHeader.jsx'

const DASHBOARD_ID = '5b0c9d1e-2f3a-4b4c-8d5e-6f7a8b9c0d1e'
const MINE = { id: DASHBOARD_ID, name: 'Returns overview', shared: false, isOwner: true, ownerName: 'Ada Lovelace' }
const MINE_SHARED = { ...MINE, shared: true }
const TEAMMATES = { id: 'finance', name: 'Finance', shared: true, isOwner: false, ownerName: 'Grace Hopper' }

function CurrentPath() {
  return <p data-testid="path">{useLocation().pathname}</p>
}

describe('DashboardHeader', () => {
  it('shows only the way back and the page title while there is no dashboard to show', () => {
    render(
      <MemoryRouter>
        <DashboardHeader />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Analytics' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /chat/i })).toHaveAttribute('href', '/chat')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('titles the page with the dashboard and lets its owner share, rename and refresh it', () => {
    render(
      <MemoryRouter>
        <DashboardHeader
          dashboard={MINE}
          dashboards={[MINE, TEAMMATES]}
          cardCount={3}
          canRefresh
          onRefresh={vi.fn()}
          onCreate={vi.fn()}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Returns overview' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /chat/i })).toHaveAttribute('href', '/chat')
    expect(screen.getByText('3 charts')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename or delete dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    expect(screen.queryByText('Shared with the team')).toBeNull()
    expect(screen.queryByText(/^Shared by/)).toBeNull()
  })

  it('counts a single chart in the singular and hides the count and Refresh on an empty dashboard', () => {
    const { rerender } = render(
      <MemoryRouter>
        <DashboardHeader
          dashboard={MINE}
          dashboards={[MINE]}
          cardCount={1}
          canRefresh={false}
          onRefresh={vi.fn()}
          onCreate={vi.fn()}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
        />
      </MemoryRouter>
    )
    expect(screen.getByText('1 chart')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()

    rerender(
      <MemoryRouter>
        <DashboardHeader
          dashboard={MINE}
          dashboards={[MINE]}
          cardCount={0}
          canRefresh={false}
          onRefresh={vi.fn()}
          onCreate={vi.fn()}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
        />
      </MemoryRouter>
    )
    expect(screen.queryByText(/chart/)).toBeNull()
  })

  it('refreshes every chart from the Refresh button', async () => {
    const onRefresh = vi.fn()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DashboardHeader
          dashboard={MINE}
          dashboards={[MINE]}
          cardCount={2}
          canRefresh
          onRefresh={onRefresh}
          onCreate={vi.fn()}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
        />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('tells the owner that the dashboard is shared with the team', () => {
    render(
      <MemoryRouter>
        <DashboardHeader
          dashboard={MINE_SHARED}
          dashboards={[MINE_SHARED]}
          cardCount={0}
          canRefresh={false}
          onRefresh={vi.fn()}
          onCreate={vi.fn()}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Shared with the team')).toHaveClass('badge', 'badge--success')
  })

  it('tells a teammate who shared the dashboard and keeps its settings away from them', () => {
    render(
      <MemoryRouter>
        <DashboardHeader
          dashboard={TEAMMATES}
          dashboards={[MINE, TEAMMATES]}
          cardCount={0}
          canRefresh={false}
          onRefresh={vi.fn()}
          onCreate={vi.fn()}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Shared by Grace Hopper')).toHaveClass('badge')
    expect(screen.getByText('Shared by Grace Hopper')).not.toHaveClass('badge--success')
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename or delete dashboard' })).toBeNull()
  })

  it('shares the dashboard from the share dialog', async () => {
    const onUpdate = vi.fn().mockResolvedValue(MINE_SHARED)
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DashboardHeader
          dashboard={MINE}
          dashboards={[MINE]}
          cardCount={0}
          canRefresh={false}
          onRefresh={vi.fn()}
          onCreate={vi.fn()}
          onUpdate={onUpdate}
          onRemove={vi.fn()}
        />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Share' }))
    const dialog = screen.getByRole('dialog', { name: 'Share dashboard' })
    await user.click(within(dialog).getByRole('switch', { name: 'Share with the team' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith(DASHBOARD_ID, { shared: true })

    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog', { name: 'Share dashboard' })).toBeNull()
  })

  it('renames the dashboard from its settings', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...MINE, name: 'Refunds' })
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DashboardHeader
          dashboard={MINE}
          dashboards={[MINE]}
          cardCount={0}
          canRefresh={false}
          onRefresh={vi.fn()}
          onCreate={vi.fn()}
          onUpdate={onUpdate}
          onRemove={vi.fn()}
        />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Rename or delete dashboard' }))
    const dialog = screen.getByRole('dialog', { name: 'Dashboard settings' })
    await user.clear(within(dialog).getByRole('textbox', { name: 'Name' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Refunds')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith(DASHBOARD_ID, { name: 'Refunds' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dashboard settings' })).toBeNull())
  })

  it('deletes the dashboard once confirmed and goes back to the dashboards', async () => {
    const onRemove = vi.fn().mockResolvedValue()
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={[`/analytics/${DASHBOARD_ID}`]}>
        <DashboardHeader
          dashboard={MINE}
          dashboards={[MINE]}
          cardCount={0}
          canRefresh={false}
          onRefresh={vi.fn()}
          onCreate={vi.fn()}
          onUpdate={vi.fn()}
          onRemove={onRemove}
        />
        <CurrentPath />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Rename or delete dashboard' }))
    await user.click(screen.getByRole('button', { name: 'Delete dashboard' }))
    expect(onRemove).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledWith(DASHBOARD_ID)
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/analytics'))
    expect(screen.getByTestId('path')).not.toHaveTextContent(DASHBOARD_ID)
  })

  it('stays on the dashboard and says why when it cannot be deleted', async () => {
    const onRemove = vi.fn().mockRejectedValue(new Error('Failed to delete the dashboard'))
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={[`/analytics/${DASHBOARD_ID}`]}>
        <DashboardHeader
          dashboard={MINE}
          dashboards={[MINE]}
          cardCount={0}
          canRefresh={false}
          onRefresh={vi.fn()}
          onCreate={vi.fn()}
          onUpdate={vi.fn()}
          onRemove={onRemove}
        />
        <CurrentPath />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Rename or delete dashboard' }))
    await user.click(screen.getByRole('button', { name: 'Delete dashboard' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to delete the dashboard')
    expect(screen.getByTestId('path')).toHaveTextContent(`/analytics/${DASHBOARD_ID}`)
  })

  it('creates a dashboard from the switcher and opens it', async () => {
    const created = { id: 'ops', name: 'Operations', shared: false, isOwner: true, ownerName: 'Ada Lovelace' }
    const onCreate = vi.fn().mockResolvedValue(created)
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={[`/analytics/${DASHBOARD_ID}`]}>
        <DashboardHeader
          dashboard={MINE}
          dashboards={[MINE]}
          cardCount={0}
          canRefresh={false}
          onRefresh={vi.fn()}
          onCreate={onCreate}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
        />
        <CurrentPath />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Returns overview' }))
    await user.click(screen.getByRole('menuitem', { name: 'New dashboard' }))
    const dialog = screen.getByRole('dialog', { name: 'New dashboard' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Operations')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledWith('Operations')
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/analytics/ops'))
    expect(screen.queryByRole('dialog', { name: 'New dashboard' })).toBeNull()
  })

  it('stays where it is and shows the limit when the dashboard cannot be created', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('You already have 20 dashboards.'))
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={[`/analytics/${DASHBOARD_ID}`]}>
        <DashboardHeader
          dashboard={MINE}
          dashboards={[MINE]}
          cardCount={0}
          canRefresh={false}
          onRefresh={vi.fn()}
          onCreate={onCreate}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
        />
        <CurrentPath />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Returns overview' }))
    await user.click(screen.getByRole('menuitem', { name: 'New dashboard' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'One more{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('You already have 20 dashboards.')
    expect(screen.getByRole('dialog', { name: 'New dashboard' })).toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent(`/analytics/${DASHBOARD_ID}`)
  })

  it('does not navigate when the session expired while creating', async () => {
    const onCreate = vi.fn().mockResolvedValue(null)
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={[`/analytics/${DASHBOARD_ID}`]}>
        <DashboardHeader
          dashboard={MINE}
          dashboards={[MINE]}
          cardCount={0}
          canRefresh={false}
          onRefresh={vi.fn()}
          onCreate={onCreate}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
        />
        <CurrentPath />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Returns overview' }))
    await user.click(screen.getByRole('menuitem', { name: 'New dashboard' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Operations{Enter}')

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('path')).toHaveTextContent(`/analytics/${DASHBOARD_ID}`)
  })
})
