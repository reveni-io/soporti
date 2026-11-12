import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import DashboardSwitcher from './DashboardSwitcher.jsx'

const MINE = { id: 'mine', name: 'My dashboard', shared: false, isOwner: true, ownerName: 'Ada Lovelace' }
const SALES = { id: 'sales', name: 'Sales', shared: true, isOwner: true, ownerName: 'Ada Lovelace' }
const FINANCE = { id: 'finance', name: 'Finance', shared: true, isOwner: false, ownerName: 'Grace Hopper' }
const LOGISTICS = { id: 'logistics', name: 'Logistics', shared: true, isOwner: false, ownerName: 'Alan Turing' }
const ALL = [MINE, SALES, FINANCE, LOGISTICS]

function OpenDashboard() {
  const { dashboardId } = useParams()

  return <p>Open dashboard: {dashboardId}</p>
}

describe('DashboardSwitcher', () => {
  it('reads as the title of the page until it is opened', () => {
    render(
      <MemoryRouter>
        <DashboardSwitcher current={MINE} dashboards={ALL} onCreate={vi.fn()} />
      </MemoryRouter>
    )
    const button = screen.getByRole('button', { name: 'My dashboard' })

    expect(screen.getByRole('heading', { level: 1, name: 'My dashboard' })).toContainElement(button)
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('lists the own dashboards and the ones shared with the team in two groups', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DashboardSwitcher current={MINE} dashboards={ALL} onCreate={vi.fn()} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'My dashboard' }))

    const menu = screen.getByRole('menu', { name: 'Dashboards' })
    const own = within(menu).getByRole('group', { name: 'Your dashboards' })
    const shared = within(menu).getByRole('group', { name: 'Shared with the team' })

    expect(screen.getByRole('button', { name: 'My dashboard' })).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(own)
        .getAllByRole('menuitem')
        .map(item => item.textContent.trim())
    ).toEqual(['My dashboard', 'Sales'])
    expect(
      within(shared)
        .getAllByRole('menuitem')
        .map(item => item.textContent)
    ).toEqual(['Finance by Grace Hopper', 'Logistics by Alan Turing'])
    expect(within(shared).getByRole('menuitem', { name: 'Finance by Grace Hopper' })).toHaveAttribute(
      'href',
      '/analytics/finance'
    )
    expect(within(menu).getByRole('menuitem', { name: 'New dashboard' })).toBeInTheDocument()
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(5)
  })

  it('leaves out the shared group when nobody shared a dashboard', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DashboardSwitcher current={MINE} dashboards={[MINE, SALES]} onCreate={vi.fn()} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'My dashboard' }))

    expect(screen.getByRole('group', { name: 'Your dashboards' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Shared with the team' })).toBeNull()
  })

  it('marks the dashboard that is open and starts the keyboard on it', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DashboardSwitcher current={SALES} dashboards={ALL} onCreate={vi.fn()} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Sales' }))

    expect(screen.getByRole('menuitem', { name: 'Sales' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('menuitem', { name: 'Sales' })).toHaveFocus()
    expect(screen.getByRole('menuitem', { name: 'My dashboard' })).not.toHaveAttribute('aria-current')
  })

  it('opens the dashboard that is picked and closes', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/analytics/mine']}>
        <DashboardSwitcher current={MINE} dashboards={ALL} onCreate={vi.fn()} />
        <Routes>
          <Route path="/analytics/:dashboardId" element={<OpenDashboard />} />
        </Routes>
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'My dashboard' }))
    await user.click(screen.getByRole('menuitem', { name: 'Finance by Grace Hopper' }))

    expect(screen.getByText('Open dashboard: finance')).toBeInTheDocument()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'My dashboard' })).toHaveFocus()
  })

  it('moves between the items with the arrow keys, Home and End', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DashboardSwitcher current={MINE} dashboards={ALL} onCreate={vi.fn()} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'My dashboard' }))
    expect(screen.getByRole('menuitem', { name: 'My dashboard' })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Sales' })).toHaveFocus()

    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'New dashboard' })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'My dashboard' })).toHaveFocus()

    await user.keyboard('{End}')
    expect(screen.getByRole('menuitem', { name: 'New dashboard' })).toHaveFocus()

    await user.keyboard('{Home}')
    expect(screen.getByRole('menuitem', { name: 'My dashboard' })).toHaveFocus()
  })

  it('opens with the down arrow and picks an item with Enter', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/analytics/mine']}>
        <DashboardSwitcher current={MINE} dashboards={ALL} onCreate={vi.fn()} />
        <Routes>
          <Route path="/analytics/:dashboardId" element={<OpenDashboard />} />
        </Routes>
      </MemoryRouter>
    )

    await user.tab()
    expect(screen.getByRole('button', { name: 'My dashboard' })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'My dashboard' })).toHaveFocus()

    await user.keyboard('{ArrowDown}{Enter}')

    expect(screen.getByText('Open dashboard: sales')).toBeInTheDocument()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on Escape and gives the focus back to the button', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DashboardSwitcher current={MINE} dashboards={ALL} onCreate={vi.fn()} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'My dashboard' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'My dashboard' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'My dashboard' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes when something outside is pressed', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DashboardSwitcher current={MINE} dashboards={ALL} onCreate={vi.fn()} />
        <button type="button">Elsewhere</button>
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'My dashboard' }))
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }))

    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes when the focus leaves with Tab', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DashboardSwitcher current={MINE} dashboards={ALL} onCreate={vi.fn()} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'My dashboard' }))
    await user.tab()

    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes when its button is pressed again', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DashboardSwitcher current={MINE} dashboards={ALL} onCreate={vi.fn()} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'My dashboard' }))
    await user.click(screen.getByRole('button', { name: 'My dashboard' }))

    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('asks for a new dashboard and closes', async () => {
    const onCreate = vi.fn()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DashboardSwitcher current={MINE} dashboards={ALL} onCreate={onCreate} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'My dashboard' }))
    await user.click(screen.getByRole('menuitem', { name: 'New dashboard' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
