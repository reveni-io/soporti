import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DashboardView from './DashboardView.jsx'

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

const CARD_ID = '8c1d2e3f-4a5b-4c6d-9e7f-a0b1c2d3e4f5'
const OTHER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const DASHBOARD_ID = '5b0c9d1e-2f3a-4b4c-8d5e-6f7a8b9c0d1e'
const CARDS_ROUTE = `GET /api/analytics/dashboards/${DASHBOARD_ID}/cards`
const CREATE_ROUTE = `POST /api/analytics/dashboards/${DASHBOARD_ID}/cards`
const LAYOUT_ROUTE = `PUT /api/analytics/dashboards/${DASHBOARD_ID}/layout`
const DASHBOARD = {
  id: DASHBOARD_ID,
  name: 'Returns overview',
  shared: false,
  isOwner: true,
  ownerName: 'Ada Lovelace',
}
const DATA_ROUTE = `GET /api/analytics/cards/${CARD_ID}/data`
const FRESH_DATA_ROUTE = `${DATA_ROUTE}?fresh=true`
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
  id: OTHER_ID,
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

function loaded(cards) {
  return respond({ dashboard: DASHBOARD, cards })
}

function directory(overrides) {
  return {
    dashboards: [DASHBOARD],
    configured: true,
    loading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  }
}

function mockApi(routes) {
  global.fetch = vi.fn().mockImplementation((url, options = {}) => {
    const response = routes[`${options.method ?? 'GET'} ${url}`]
    return Promise.resolve(response ?? respond({}, 404))
  })
}

function callsTo(route) {
  return global.fetch.mock.calls.filter(([url, options = {}]) => `${options.method ?? 'GET'} ${url}` === route)
}

function bodyOf(route) {
  return JSON.parse(callsTo(route)[0][1].body)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DashboardView', () => {
  it('names the dashboard from the list right away and waits quietly for its cards', async () => {
    let resolveCards
    global.fetch = vi.fn().mockReturnValue(
      new Promise(resolve => {
        resolveCards = resolve
      })
    )

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Returns overview' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /chat/i })).toHaveAttribute('href', '/chat')
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()

    await act(async () => resolveCards(loaded([])))

    expect(screen.queryByText('Loading…')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Your dashboard starts with a question.' })).toBeInTheDocument()
  })

  it('keeps waiting while the list of dashboards is still loading', async () => {
    mockApi({ [CARDS_ROUTE]: loaded([]) })

    render(
      <MemoryRouter>
        <DashboardView
          dashboardId={DASHBOARD_ID}
          token="tok"
          onLogout={logout}
          directory={directory({ dashboards: [], configured: null, loading: true })}
        />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { level: 1, name: 'Returns overview' })).toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your dashboard starts with a question.' })).toBeNull()
  })

  it('names a dashboard that is not in the list from what the server sent with its cards', async () => {
    const teammates = { ...DASHBOARD, name: 'Finance', shared: true, isOwner: false, ownerName: 'Grace Hopper' }
    mockApi({ [CARDS_ROUTE]: respond({ dashboard: teammates, cards: [] }) })

    render(
      <MemoryRouter>
        <DashboardView
          dashboardId={DASHBOARD_ID}
          token="tok"
          onLogout={logout}
          directory={directory({ dashboards: [] })}
        />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { level: 1, name: 'Finance' })).toBeInTheDocument()
    expect(screen.getByText('Shared by Grace Hopper')).toBeInTheDocument()
  })

  it('says the dashboard is not available when the server does not find it', async () => {
    mockApi({ [CARDS_ROUTE]: respond({ error: 'Dashboard not found.' }, 404) })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'This dashboard is not available' })).toBeInTheDocument()
    expect(screen.getByText('It does not exist or is no longer shared with you.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to my dashboards' })).toHaveAttribute('href', '/analytics')
    expect(screen.getByRole('heading', { level: 1, name: 'Analytics' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Describe the chart you want' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(logout).not.toHaveBeenCalled()
  })

  it('shows the error of the list of dashboards when that is what failed', async () => {
    mockApi({ [CARDS_ROUTE]: loaded([]) })

    render(
      <MemoryRouter>
        <DashboardView
          dashboardId={DASHBOARD_ID}
          token="tok"
          onLogout={logout}
          directory={directory({ dashboards: [], configured: null, error: 'Failed to load your dashboards' })}
        />
      </MemoryRouter>
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load your dashboards')
    expect(screen.queryByRole('heading', { name: 'Your dashboard starts with a question.' })).toBeNull()
  })

  it('shows the error when the cards cannot be loaded', async () => {
    mockApi({ [CARDS_ROUTE]: respond({ error: 'Analytics is unavailable.' }, 500) })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Analytics is unavailable.')
    expect(screen.queryByRole('heading', { name: 'Your dashboard starts with a question.' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Connect a database first' })).toBeNull()
  })

  it('logs out when the session expired', async () => {
    mockApi({ [CARDS_ROUTE]: respond({}, 401) })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
  })

  it('asks for a database connection before anything else when none is configured', async () => {
    mockApi({ [CARDS_ROUTE]: loaded([]) })

    render(
      <MemoryRouter>
        <DashboardView
          dashboardId={DASHBOARD_ID}
          token="tok"
          onLogout={logout}
          directory={directory({ configured: false })}
        />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Connect a database first' })).toBeInTheDocument()
    expect(
      screen.getByText(/PostgreSQL database configured in the admin panel \(Database section\)/)
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open admin' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('textbox', { name: 'Describe the chart you want' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create chart' })).toBeDisabled()
    expect(screen.queryByRole('heading', { name: 'Your dashboard starts with a question.' })).toBeNull()
  })

  it('fills the ask bar with the example picked on the empty dashboard, without asking', async () => {
    const user = userEvent.setup()
    mockApi({ [CARDS_ROUTE]: loaded([]) })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )
    expect(await screen.findByRole('heading', { name: 'Your dashboard starts with a question.' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Top 10 customers by revenue this year' }))

    const input = screen.getByRole('textbox', { name: 'Describe the chart you want' })
    expect(input).toHaveValue('Top 10 customers by revenue this year')
    expect(input).toHaveFocus()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('adds the chart it is asked for as a card that is being generated', async () => {
    const user = userEvent.setup()
    mockApi({
      [CARDS_ROUTE]: loaded([]),
      [CREATE_ROUTE]: respond({ card: GENERATING_CARD }, 202),
    })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )
    await screen.findByRole('heading', { name: 'Your dashboard starts with a question.' })

    await user.type(screen.getByRole('textbox', { name: 'Describe the chart you want' }), 'Orders per week{Enter}')

    const card = await screen.findByRole('article', { name: 'Orders per week' })
    expect(within(card).getByRole('status')).toHaveTextContent('Thinking…')
    expect(screen.getByText('1 chart')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your dashboard starts with a question.' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Describe the chart you want' })).toHaveValue('')
    expect(bodyOf(CREATE_ROUTE)).toEqual({ prompt: 'Orders per week' })
  })

  it('keeps the prompt and shows the reason when the chart cannot be created', async () => {
    const user = userEvent.setup()
    mockApi({
      [CARDS_ROUTE]: loaded([]),
      [CREATE_ROUTE]: respond({ error: 'You already have 50 charts.' }, 409),
    })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )
    await screen.findByRole('heading', { name: 'Your dashboard starts with a question.' })

    await user.type(screen.getByRole('textbox', { name: 'Describe the chart you want' }), 'Orders per week{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('You already have 50 charts.')
    expect(screen.getByRole('textbox', { name: 'Describe the chart you want' })).toHaveValue('Orders per week')
  })

  it('draws a ready card from the data endpoint and counts the charts', async () => {
    mockApi({
      [CARDS_ROUTE]: loaded([READY_CARD, GENERATING_CARD]),
      [DATA_ROUTE]: respond(RESULT),
    })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )

    const card = await screen.findByRole('article', { name: 'Returns per week' })
    expect(await within(card).findByRole('img', { name: /^Bar chart of Returns with 2 points/ })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Orders per week' })).toBeInTheDocument()
    expect(screen.getByText('2 charts')).toBeInTheDocument()
    expect(callsTo(DATA_ROUTE)).toHaveLength(1)
  })

  it('runs the query of every ready card again from the Refresh button', async () => {
    const user = userEvent.setup()
    mockApi({
      [CARDS_ROUTE]: loaded([READY_CARD]),
      [DATA_ROUTE]: respond(RESULT),
      [FRESH_DATA_ROUTE]: respond({ ...RESULT, rows: RESULT.rows.slice(0, 1) }),
    })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns with 2 points/ })
    expect(callsTo(FRESH_DATA_ROUTE)).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await screen.findByRole('img', { name: /^Bar chart of Returns with 1 point/ })).toBeInTheDocument()
    expect(callsTo(FRESH_DATA_ROUTE)).toHaveLength(1)
    expect(callsTo(DATA_ROUTE)).toHaveLength(1)
    expect(callsTo(CARDS_ROUTE)).toHaveLength(1)
  })

  it('hides the Refresh button while no card is ready', async () => {
    mockApi({ [CARDS_ROUTE]: loaded([GENERATING_CARD]) })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )

    expect(await screen.findByRole('article', { name: 'Orders per week' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
  })

  it('saves the layout when a card is moved', async () => {
    const user = userEvent.setup()
    mockApi({
      [CARDS_ROUTE]: loaded([READY_CARD]),
      [DATA_ROUTE]: respond(RESULT),
      [LAYOUT_ROUTE]: respond({ ok: true }),
    })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )
    const handle = await screen.findByRole('group', { name: /^Move chart/ })

    act(() => handle.focus())
    await user.keyboard('{ArrowRight}')

    await waitFor(() => expect(callsTo(LAYOUT_ROUTE)).toHaveLength(1))
    expect(bodyOf(LAYOUT_ROUTE)).toEqual({ items: [{ id: CARD_ID, x: 1, y: 0, w: 6, h: 4 }] })
    expect(callsTo(DATA_ROUTE)).toHaveLength(1)
  })

  it('opens the editor of a card and closes it again', async () => {
    const user = userEvent.setup()
    mockApi({
      [CARDS_ROUTE]: loaded([READY_CARD]),
      [DATA_ROUTE]: respond(RESULT),
      'POST /api/analytics/query': respond({ ...RESULT, chart: BAR }),
    })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.click(screen.getByRole('button', { name: 'Edit chart and SQL' }))

    const editor = screen.getByRole('dialog', { name: 'Edit chart' })
    expect(within(editor).getByRole('textbox', { name: 'Title' })).toHaveValue('Returns per week')
    expect(await within(editor).findByRole('img', { name: /^Bar chart of Returns/ })).toBeInTheDocument()

    await user.click(within(editor).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Edit chart' })).toBeNull()
  })

  it('saves the edits of a card and shows them on the dashboard', async () => {
    const user = userEvent.setup()
    const renamed = { ...READY_CARD, title: 'Weekly returns', chart: { ...BAR, type: 'line' } }
    mockApi({
      [CARDS_ROUTE]: loaded([READY_CARD]),
      [DATA_ROUTE]: respond(RESULT),
      'POST /api/analytics/query': respond({ ...RESULT, chart: BAR }),
      [`PUT /api/analytics/cards/${CARD_ID}`]: respond({ card: renamed }),
    })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })
    await user.click(screen.getByRole('button', { name: 'Edit chart and SQL' }))
    const editor = screen.getByRole('dialog', { name: 'Edit chart' })
    await within(editor).findByRole('img', { name: /^Bar chart of Returns/ })

    await user.clear(within(editor).getByRole('textbox', { name: 'Title' }))
    await user.type(within(editor).getByRole('textbox', { name: 'Title' }), 'Weekly returns')
    await user.click(within(editor).getByRole('button', { name: 'Line' }))
    await user.click(within(editor).getByRole('button', { name: 'Save' }))

    const card = await screen.findByRole('article', { name: 'Weekly returns' })
    expect(within(card).getByRole('img', { name: /^Line chart of Returns/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Edit chart' })).toBeNull()
    expect(bodyOf(`PUT /api/analytics/cards/${CARD_ID}`)).toEqual({
      title: 'Weekly returns',
      sql: READY_CARD.sql,
      chart: { ...BAR, type: 'line' },
    })
    expect(callsTo(DATA_ROUTE)).toHaveLength(1)
  })

  it('sends a change request from the editor and shows the card being generated again', async () => {
    const user = userEvent.setup()
    const revising = { ...READY_CARD, status: 'generating', prompt: 'make it monthly', step: 'Rewriting the query' }
    mockApi({
      [CARDS_ROUTE]: loaded([READY_CARD]),
      [DATA_ROUTE]: respond(RESULT),
      'POST /api/analytics/query': respond({ ...RESULT, chart: BAR }),
      [`POST /api/analytics/cards/${CARD_ID}/revise`]: respond({ card: revising }, 202),
    })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })
    await user.click(screen.getByRole('button', { name: 'Edit chart and SQL' }))

    await user.type(screen.getByRole('textbox', { name: 'Ask for a change' }), 'make it monthly{Enter}')

    expect(await screen.findByRole('status')).toHaveTextContent('Rewriting the query…')
    expect(screen.queryByRole('dialog', { name: 'Edit chart' })).toBeNull()
    expect(bodyOf(`POST /api/analytics/cards/${CARD_ID}/revise`)).toEqual({ prompt: 'make it monthly' })
  })

  it('retries a failed card', async () => {
    const user = userEvent.setup()
    const failed = { ...GENERATING_CARD, status: 'failed', error: 'I could not find a table with orders.' }
    mockApi({
      [CARDS_ROUTE]: loaded([failed]),
      [`POST /api/analytics/cards/${OTHER_ID}/retry`]: respond({ card: GENERATING_CARD }, 202),
    })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )
    expect(await screen.findByText('I could not find a table with orders.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Thinking…')
    expect(screen.queryByText('I could not find a table with orders.')).toBeNull()
    expect(callsTo(`POST /api/analytics/cards/${OTHER_ID}/retry`)).toHaveLength(1)
  })

  it('shows why a card action failed', async () => {
    const user = userEvent.setup()
    const failed = { ...GENERATING_CARD, status: 'failed', error: 'I could not find a table with orders.' }
    mockApi({
      [CARDS_ROUTE]: loaded([failed]),
      [`POST /api/analytics/cards/${OTHER_ID}/retry`]: respond({ error: 'The chart is already being generated.' }, 409),
    })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )
    await screen.findByText('I could not find a table with orders.')

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The chart is already being generated.')
    expect(screen.getByText('I could not find a table with orders.')).toBeInTheDocument()
  })

  it('deletes a card once confirmed and goes back to the empty dashboard', async () => {
    const user = userEvent.setup()
    mockApi({
      [CARDS_ROUTE]: loaded([READY_CARD]),
      [DATA_ROUTE]: respond(RESULT),
      [`DELETE /api/analytics/cards/${CARD_ID}`]: respond({ ok: true }),
    })

    render(
      <MemoryRouter>
        <DashboardView dashboardId={DASHBOARD_ID} token="tok" onLogout={logout} directory={directory()} />
      </MemoryRouter>
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.click(screen.getByRole('button', { name: 'Delete chart' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByRole('heading', { name: 'Your dashboard starts with a question.' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Returns per week' })).toBeNull()
    expect(screen.queryByText('1 chart')).toBeNull()
    expect(callsTo(`DELETE /api/analytics/cards/${CARD_ID}`)).toHaveLength(1)
  })
})
