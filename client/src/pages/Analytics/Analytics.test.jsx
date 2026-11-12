import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom'
import Analytics from './Analytics.jsx'

vi.mock('recharts', () => {
  function chartMock({ children, role, 'aria-label': label }) {
    return (
      <div role={role} aria-label={label}>
        {children}
      </div>
    )
  }

  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    BarChart: chartMock,
    LineChart: chartMock,
    AreaChart: chartMock,
    PieChart: chartMock,
    BarStack: ({ children }) => <div>{children}</div>,
    Bar: () => null,
    Line: () => null,
    Area: () => null,
    Pie: () => null,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
  }
})

const logout = vi.fn()

vi.mock('../../hooks/useAuth/useAuth.js', () => ({
  useAuth: () => ({ token: 'tok', logout }),
}))

const MINE_ID = '5b0c9d1e-2f3a-4b4c-8d5e-6f7a8b9c0d1e'
const SALES_ID = '7d2e1f0a-3b4c-4d5e-9f6a-7b8c9d0e1f2a'
const FINANCE_ID = '9f4a3b2c-1d0e-4f5a-8b6c-7d8e9f0a1b2c'
const CARD_ID = '8c1d2e3f-4a5b-4c6d-9e7f-a0b1c2d3e4f5'
const LIST_ROUTE = 'GET /api/analytics/dashboards'
const MINE = { id: MINE_ID, name: 'My dashboard', shared: false, isOwner: true, ownerName: 'Ada Lovelace' }
const SALES = { id: SALES_ID, name: 'Sales', shared: true, isOwner: true, ownerName: 'Ada Lovelace' }
const FINANCE = { id: FINANCE_ID, name: 'Finance', shared: true, isOwner: false, ownerName: 'Grace Hopper' }
const BAR = {
  type: 'bar',
  xKey: 'week',
  groupKey: null,
  series: [{ key: 'returns', label: 'Returns' }],
  stacked: false,
}
const READY_CARD = {
  id: CARD_ID,
  title: 'Returns per week',
  prompt: 'Returns per week over the last 3 months',
  sql: 'SELECT week, returns FROM weekly_returns',
  chart: BAR,
  layout: { x: 0, y: 0, w: 6, h: 4 },
  status: 'ready',
  step: null,
  error: null,
}
const GENERATING_CARD = {
  id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  title: 'Orders per week',
  prompt: 'Orders per week',
  sql: null,
  chart: null,
  layout: { x: 6, y: 0, w: 6, h: 4 },
  status: 'generating',
  step: null,
  error: null,
}
const RESULT = {
  columns: [
    { name: 'week', kind: 'date' },
    { name: 'returns', kind: 'number' },
  ],
  rows: [
    { week: '2026-08-03T00:00:00.000Z', returns: 42 },
    { week: '2026-08-10T00:00:00.000Z', returns: 51 },
  ],
  truncated: false,
}

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function cardsRoute(dashboardId) {
  return `GET /api/analytics/dashboards/${dashboardId}/cards`
}

function listed(dashboards, configured = true) {
  return respond({ configured, dashboards })
}

function mockApi(routes) {
  global.fetch = vi.fn().mockImplementation((url, options = {}) => {
    const response = routes[`${options.method ?? 'GET'} ${url}`]
    return Promise.resolve(response ?? respond({ error: 'Not found.' }, 404))
  })
}

function callsTo(route) {
  return global.fetch.mock.calls.filter(([url, options = {}]) => `${options.method ?? 'GET'} ${url}` === route)
}

function bodyOf(route) {
  return JSON.parse(callsTo(route)[0][1].body)
}

function requestedUrls() {
  return global.fetch.mock.calls.map(([url]) => url)
}

function AnalyticsAtRoute() {
  const { dashboardId } = useParams()

  return <Analytics dashboardId={dashboardId ?? null} />
}

function CurrentPath() {
  return <p data-testid="path">{useLocation().pathname}</p>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Analytics', () => {
  it('lands on the first dashboard the user owns, waiting quietly meanwhile', async () => {
    let resolveList
    global.fetch = vi.fn().mockImplementation(url => {
      if (url === '/api/analytics/dashboards') {
        return new Promise(resolve => {
          resolveList = resolve
        })
      }

      return Promise.resolve(respond({ dashboard: SALES, cards: [] }))
    })

    render(
      <MemoryRouter initialEntries={['/analytics']}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Analytics' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /chat/i })).toHaveAttribute('href', '/chat')
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await act(async () => resolveList(listed([FINANCE, SALES, MINE])))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sales' })).toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent(`/analytics/${SALES_ID}`)
    expect(callsTo(LIST_ROUTE)).toHaveLength(1)
    expect(callsTo(cardsRoute(SALES_ID))).toHaveLength(1)
  })

  it('shows the error when the dashboards cannot be loaded', async () => {
    mockApi({ [LIST_ROUTE]: respond({ error: 'Analytics is unavailable.' }, 500) })

    render(
      <MemoryRouter initialEntries={['/analytics']}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Analytics is unavailable.')
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(screen.getByTestId('path')).toHaveTextContent('/analytics')
  })

  it('logs out when the session expired', async () => {
    mockApi({ [LIST_ROUTE]: respond({}, 401) })

    render(
      <MemoryRouter initialEntries={['/analytics']}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
  })

  it('opens the dashboard of the link and draws its cards', async () => {
    mockApi({
      [LIST_ROUTE]: listed([MINE, FINANCE]),
      [cardsRoute(MINE_ID)]: respond({ dashboard: MINE, cards: [READY_CARD] }),
      [`GET /api/analytics/cards/${CARD_ID}/data`]: respond(RESULT),
    })

    render(
      <MemoryRouter initialEntries={[`/analytics/${MINE_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { level: 1, name: 'My dashboard' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /^Bar chart of Returns with 2 points/ })).toBeInTheDocument()
    expect(screen.getByText('1 chart')).toBeInTheDocument()
    expect(screen.queryByText('Shared with the team')).toBeNull()
    expect(screen.queryByText(/^Shared by/)).toBeNull()
    expect(screen.getByTestId('path')).toHaveTextContent(`/analytics/${MINE_ID}`)
    expect(callsTo(LIST_ROUTE)).toHaveLength(1)
  })

  it('says the dashboard is not available when the server answers 404 for it', async () => {
    mockApi({ [LIST_ROUTE]: listed([MINE]) })

    render(
      <MemoryRouter initialEntries={[`/analytics/${FINANCE_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'This dashboard is not available' })).toBeInTheDocument()
    expect(screen.getByText('It does not exist or is no longer shared with you.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Describe the chart you want' })).toBeNull()
    expect(callsTo(cardsRoute(FINANCE_ID))).toHaveLength(1)
  })

  it('goes from an unavailable dashboard back to the own ones', async () => {
    const user = userEvent.setup()
    mockApi({
      [LIST_ROUTE]: listed([MINE]),
      [cardsRoute(MINE_ID)]: respond({ dashboard: MINE, cards: [] }),
    })

    render(
      <MemoryRouter initialEntries={[`/analytics/${FINANCE_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )

    await user.click(await screen.findByRole('link', { name: 'Go to my dashboards' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'My dashboard' })).toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent(`/analytics/${MINE_ID}`)
    expect(callsTo(LIST_ROUTE)).toHaveLength(1)
  })

  it('marks an own dashboard that is shared with the team', async () => {
    mockApi({
      [LIST_ROUTE]: listed([MINE, SALES]),
      [cardsRoute(SALES_ID)]: respond({ dashboard: SALES, cards: [] }),
    })

    render(
      <MemoryRouter initialEntries={[`/analytics/${SALES_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )

    expect(await screen.findByText('Shared with the team')).toHaveClass('badge--success')
    expect(screen.getByRole('button', { name: 'Rename or delete dashboard' })).toBeInTheDocument()
  })

  it('says who shared a dashboard of a teammate and keeps its settings away', async () => {
    mockApi({
      [LIST_ROUTE]: listed([MINE, FINANCE]),
      [cardsRoute(FINANCE_ID)]: respond({ dashboard: FINANCE, cards: [] }),
    })

    render(
      <MemoryRouter initialEntries={[`/analytics/${FINANCE_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )

    expect(await screen.findByText('Shared by Grace Hopper')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Finance' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename or delete dashboard' })).toBeNull()
  })

  it('asks for a database connection when none is configured', async () => {
    mockApi({
      [LIST_ROUTE]: listed([MINE], false),
      [cardsRoute(MINE_ID)]: respond({ dashboard: MINE, cards: [] }),
    })

    render(
      <MemoryRouter initialEntries={[`/analytics/${MINE_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Connect a database first' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Describe the chart you want' })).toBeDisabled()
  })

  it('scopes every request about the cards to the dashboard that is open', async () => {
    const user = userEvent.setup()
    mockApi({
      [LIST_ROUTE]: listed([MINE, SALES]),
      [cardsRoute(SALES_ID)]: respond({ dashboard: SALES, cards: [READY_CARD] }),
      [`GET /api/analytics/cards/${CARD_ID}/data`]: respond(RESULT),
      [`POST /api/analytics/dashboards/${SALES_ID}/cards`]: respond({ card: GENERATING_CARD }, 202),
      [`PUT /api/analytics/dashboards/${SALES_ID}/layout`]: respond({ ok: true }),
    })

    render(
      <MemoryRouter initialEntries={[`/analytics/${SALES_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.type(screen.getByRole('textbox', { name: 'Describe the chart you want' }), 'Orders per week{Enter}')
    expect(await screen.findByRole('article', { name: 'Orders per week' })).toBeInTheDocument()

    const handle = within(screen.getByRole('article', { name: 'Returns per week' })).getByRole('group', {
      name: /^Move chart/,
    })
    act(() => handle.focus())
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    await waitFor(() => expect(callsTo(`PUT /api/analytics/dashboards/${SALES_ID}/layout`)).toHaveLength(1))

    expect(bodyOf(`POST /api/analytics/dashboards/${SALES_ID}/cards`)).toEqual({ prompt: 'Orders per week' })
    expect(callsTo(cardsRoute(SALES_ID))).toHaveLength(1)
    expect(
      requestedUrls()
        .filter(url => url.includes('/dashboards/'))
        .every(url => url.includes(SALES_ID))
    ).toBe(true)
    expect(requestedUrls().some(url => url.includes(MINE_ID))).toBe(false)
  })

  it('switches to another dashboard without showing the cards of the one it leaves', async () => {
    let resolveFinanceCards
    const user = userEvent.setup()
    global.fetch = vi.fn().mockImplementation(url => {
      if (url === '/api/analytics/dashboards') return Promise.resolve(listed([MINE, FINANCE]))
      if (url.endsWith('/data')) return Promise.resolve(respond(RESULT))
      if (url.includes(MINE_ID)) return Promise.resolve(respond({ dashboard: MINE, cards: [READY_CARD] }))

      return new Promise(resolve => {
        resolveFinanceCards = resolve
      })
    })

    render(
      <MemoryRouter initialEntries={[`/analytics/${MINE_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )
    await screen.findByRole('article', { name: 'Returns per week' })

    await user.click(screen.getByRole('button', { name: 'My dashboard' }))
    await user.click(screen.getByRole('menuitem', { name: 'Finance by Grace Hopper' }))

    expect(screen.getByTestId('path')).toHaveTextContent(`/analytics/${FINANCE_ID}`)
    expect(screen.getByRole('heading', { level: 1, name: 'Finance' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Returns per week' })).toBeNull()
    expect(screen.queryByText('1 chart')).toBeNull()
    expect(screen.getByText('Loading…')).toBeInTheDocument()

    await act(async () =>
      resolveFinanceCards(respond({ dashboard: FINANCE, cards: [{ ...GENERATING_CARD, title: 'Margin by month' }] }))
    )

    expect(screen.getByRole('article', { name: 'Margin by month' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Returns per week' })).toBeNull()
    expect(callsTo(LIST_ROUTE)).toHaveLength(1)
    expect(callsTo(cardsRoute(FINANCE_ID))).toHaveLength(1)
  })

  it('clears what was typed in the ask bar when the dashboard changes', async () => {
    const user = userEvent.setup()
    mockApi({
      [LIST_ROUTE]: listed([MINE, SALES]),
      [cardsRoute(MINE_ID)]: respond({ dashboard: MINE, cards: [] }),
      [cardsRoute(SALES_ID)]: respond({ dashboard: SALES, cards: [] }),
    })

    render(
      <MemoryRouter initialEntries={[`/analytics/${MINE_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )
    await screen.findByRole('heading', { name: 'Your dashboard starts with a question.' })
    await user.type(screen.getByRole('textbox', { name: 'Describe the chart you want' }), 'Half a thought')

    await user.click(screen.getByRole('button', { name: 'My dashboard' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sales' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sales' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Describe the chart you want' })).toHaveValue('')
  })

  it('creates a dashboard from the switcher and opens it', async () => {
    const created = { id: SALES_ID, name: 'Operations', shared: false, isOwner: true, ownerName: 'Ada Lovelace' }
    const user = userEvent.setup()
    mockApi({
      [LIST_ROUTE]: listed([MINE, FINANCE]),
      [cardsRoute(MINE_ID)]: respond({ dashboard: MINE, cards: [] }),
      'POST /api/analytics/dashboards': respond({ dashboard: created }, 201),
      [cardsRoute(SALES_ID)]: respond({ dashboard: created, cards: [] }),
    })

    render(
      <MemoryRouter initialEntries={[`/analytics/${MINE_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )
    await screen.findByRole('heading', { name: 'Your dashboard starts with a question.' })

    await user.click(screen.getByRole('button', { name: 'My dashboard' }))
    await user.click(screen.getByRole('menuitem', { name: 'New dashboard' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Operations')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Operations' })).toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent(`/analytics/${SALES_ID}`)
    expect(screen.queryByRole('dialog', { name: 'New dashboard' })).toBeNull()
    expect(bodyOf('POST /api/analytics/dashboards')).toEqual({ name: 'Operations' })

    await user.click(screen.getByRole('button', { name: 'Operations' }))
    const own = screen.getByRole('group', { name: 'Your dashboards' })
    expect(within(own).getAllByRole('menuitem')).toHaveLength(2)
    expect(within(own).getByRole('menuitem', { name: 'Operations' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows the limit of dashboards and stays on the open one', async () => {
    const user = userEvent.setup()
    mockApi({
      [LIST_ROUTE]: listed([MINE]),
      [cardsRoute(MINE_ID)]: respond({ dashboard: MINE, cards: [] }),
      'POST /api/analytics/dashboards': respond({ error: 'You already have 20 dashboards.' }, 422),
    })

    render(
      <MemoryRouter initialEntries={[`/analytics/${MINE_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )
    await screen.findByRole('heading', { name: 'Your dashboard starts with a question.' })

    await user.click(screen.getByRole('button', { name: 'My dashboard' }))
    await user.click(screen.getByRole('menuitem', { name: 'New dashboard' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'One more{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('You already have 20 dashboards.')
    expect(screen.getByTestId('path')).toHaveTextContent(`/analytics/${MINE_ID}`)
  })

  it('renames the dashboard and shows the new name in the header', async () => {
    const user = userEvent.setup()
    mockApi({
      [LIST_ROUTE]: listed([MINE]),
      [cardsRoute(MINE_ID)]: respond({ dashboard: MINE, cards: [] }),
      [`PUT /api/analytics/dashboards/${MINE_ID}`]: respond({ dashboard: { ...MINE, name: 'Returns overview' } }),
    })

    render(
      <MemoryRouter initialEntries={[`/analytics/${MINE_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )
    await screen.findByRole('heading', { name: 'Your dashboard starts with a question.' })

    await user.click(screen.getByRole('button', { name: 'Rename or delete dashboard' }))
    await user.clear(screen.getByRole('textbox', { name: 'Name' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Returns overview')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Returns overview' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Dashboard settings' })).toBeNull()
    expect(bodyOf(`PUT /api/analytics/dashboards/${MINE_ID}`)).toEqual({ name: 'Returns overview' })
  })

  it('shares the dashboard with the team and offers its link', async () => {
    const user = userEvent.setup()
    mockApi({
      [LIST_ROUTE]: listed([MINE]),
      [cardsRoute(MINE_ID)]: respond({ dashboard: MINE, cards: [] }),
      [`PUT /api/analytics/dashboards/${MINE_ID}`]: respond({ dashboard: { ...MINE, shared: true } }),
    })

    render(
      <MemoryRouter initialEntries={[`/analytics/${MINE_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )
    await screen.findByRole('heading', { name: 'Your dashboard starts with a question.' })

    await user.click(screen.getByRole('button', { name: 'Share' }))
    const dialog = screen.getByRole('dialog', { name: 'Share dashboard' })
    expect(within(dialog).queryByRole('textbox', { name: 'Link' })).toBeNull()

    await user.click(within(dialog).getByRole('switch', { name: 'Share with the team' }))

    expect(await screen.findByText('Shared with the team', { selector: '.badge' })).toBeInTheDocument()
    expect(within(dialog).getByRole('switch', { name: 'Share with the team' })).toBeChecked()
    expect(within(dialog).getByRole('textbox', { name: 'Link' })).toHaveValue(
      `${window.location.origin}/analytics/${MINE_ID}`
    )
    expect(bodyOf(`PUT /api/analytics/dashboards/${MINE_ID}`)).toEqual({ shared: true })
  })

  it('puts the switch back when the dashboard cannot be shared', async () => {
    const user = userEvent.setup()
    mockApi({
      [LIST_ROUTE]: listed([MINE]),
      [cardsRoute(MINE_ID)]: respond({ dashboard: MINE, cards: [] }),
      [`PUT /api/analytics/dashboards/${MINE_ID}`]: respond({ error: 'Analytics is unavailable.' }, 500),
    })

    render(
      <MemoryRouter initialEntries={[`/analytics/${MINE_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )
    await screen.findByRole('heading', { name: 'Your dashboard starts with a question.' })

    await user.click(screen.getByRole('button', { name: 'Share' }))
    await user.click(screen.getByRole('switch', { name: 'Share with the team' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Analytics is unavailable.')
    expect(screen.getByRole('switch', { name: 'Share with the team' })).not.toBeChecked()
    expect(screen.queryByText('Shared with the team', { selector: '.badge' })).toBeNull()
  })

  it('deletes the dashboard once confirmed and lands on another own one', async () => {
    const user = userEvent.setup()
    mockApi({
      [LIST_ROUTE]: listed([MINE, SALES]),
      [cardsRoute(SALES_ID)]: respond({ dashboard: SALES, cards: [] }),
      [cardsRoute(MINE_ID)]: respond({ dashboard: MINE, cards: [] }),
      [`DELETE /api/analytics/dashboards/${SALES_ID}`]: respond({ ok: true }),
    })

    render(
      <MemoryRouter initialEntries={[`/analytics/${SALES_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )
    await screen.findByRole('heading', { name: 'Your dashboard starts with a question.' })

    await user.click(screen.getByRole('button', { name: 'Rename or delete dashboard' }))
    await user.click(screen.getByRole('button', { name: 'Delete dashboard' }))
    expect(screen.getByRole('group', { name: 'Delete this dashboard and its charts?' })).toBeInTheDocument()
    expect(callsTo(`DELETE /api/analytics/dashboards/${SALES_ID}`)).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'My dashboard' })).toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent(`/analytics/${MINE_ID}`)
    expect(callsTo(`DELETE /api/analytics/dashboards/${SALES_ID}`)).toHaveLength(1)
    expect(callsTo(LIST_ROUTE)).toHaveLength(1)
  })

  it('lands on the dashboard the server starts over with when the last own one is deleted', async () => {
    const starter = { ...MINE, id: SALES_ID, name: 'My dashboard' }
    const user = userEvent.setup()
    global.fetch = vi.fn().mockImplementation((url, options = {}) => {
      if (options.method === 'DELETE') return Promise.resolve(respond({ ok: true }))
      if (url === '/api/analytics/dashboards') {
        const isFirstList = callsTo(LIST_ROUTE).length === 1
        return Promise.resolve(listed(isFirstList ? [{ ...MINE, name: 'Old one' }] : [starter]))
      }

      const dashboard = url.includes(MINE_ID) ? { ...MINE, name: 'Old one' } : starter
      return Promise.resolve(respond({ dashboard, cards: [] }))
    })

    render(
      <MemoryRouter initialEntries={[`/analytics/${MINE_ID}`]}>
        <Routes>
          <Route path="/analytics" element={<AnalyticsAtRoute />} />
          <Route path="/analytics/:dashboardId" element={<AnalyticsAtRoute />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    )
    await screen.findByRole('heading', { level: 1, name: 'Old one' })

    await user.click(screen.getByRole('button', { name: 'Rename or delete dashboard' }))
    await user.click(screen.getByRole('button', { name: 'Delete dashboard' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'My dashboard' })).toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent(`/analytics/${SALES_ID}`)
    expect(callsTo(LIST_ROUTE)).toHaveLength(2)
  })
})
