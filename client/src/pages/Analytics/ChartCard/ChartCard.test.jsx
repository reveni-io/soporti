import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChartCard from './ChartCard.jsx'

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

const CARD_ID = '8c1d2e3f-4a5b-4c6d-9e7f-a0b1c2d3e4f5'
const DATA_URL = `/api/analytics/cards/${CARD_ID}/data`
const READY_CARD = {
  id: CARD_ID,
  title: 'Returns per week',
  prompt: 'Returns per week over the last 3 months',
  sql: 'SELECT week, returns FROM weekly_returns',
  chart: { type: 'bar', xKey: 'week', groupKey: null, series: [{ key: 'returns', label: 'Returns' }], stacked: false },
  layout: { x: 0, y: 0, w: 6, h: 4 },
  status: 'ready',
  step: null,
  error: null,
}
const GENERATING_CARD = {
  ...READY_CARD,
  sql: null,
  chart: null,
  status: 'generating',
  step: 'Reading the columns of returns',
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

function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })

  return { promise, resolve }
}

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn().mockResolvedValue(respond(RESULT))
})

describe('ChartCard', () => {
  it('draws the chart of a ready card from its data', async () => {
    render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByRole('article', { name: 'Returns per week' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Returns per week' })).toHaveAttribute('title', 'Returns per week')
    expect(screen.getByText('Loading data…')).toBeInTheDocument()

    expect(await screen.findByRole('img', { name: /^Bar chart of Returns/ })).toBeInTheDocument()
    expect(screen.queryByText('Loading data…')).toBeNull()
    expect(screen.queryByText('First 2,000 rows')).toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(DATA_URL)
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('offers to refresh, edit and delete a ready card', async () => {
    render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart/ })

    expect(screen.getByRole('button', { name: 'Refresh data' })).toHaveAttribute(
      'title',
      'Refresh data (runs the query again)'
    )
    expect(screen.getByRole('button', { name: 'Edit chart and SQL' })).toHaveAttribute('title', 'Edit chart and SQL')
    expect(screen.getByRole('button', { name: 'Delete chart' })).toHaveAttribute('title', 'Delete chart')
  })

  it('says when the chart only shows the first rows of the result', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ ...RESULT, truncated: true }))

    render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(await screen.findByText('First 2,000 rows')).toBeInTheDocument()
  })

  it('runs the query again from the refresh action, dimming the chart meanwhile', async () => {
    const refetch = deferred()
    global.fetch = vi.fn().mockResolvedValueOnce(respond(RESULT)).mockReturnValueOnce(refetch.promise)
    const user = userEvent.setup()
    const { container } = render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /with 2 points$/ })

    await user.click(screen.getByRole('button', { name: 'Refresh data' }))

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(global.fetch.mock.calls[1][0]).toBe(`${DATA_URL}?fresh=true`)
    expect(container.querySelector('.chart-card__chart')).toHaveClass('chart-card__chart--refreshing')
    expect(screen.getByRole('img', { name: /with 2 points$/ })).toBeInTheDocument()

    await act(async () => refetch.resolve(respond({ ...RESULT, rows: RESULT.rows.slice(0, 1) })))

    expect(screen.getByRole('img', { name: /with 1 point$/ })).toBeInTheDocument()
    expect(container.querySelector('.chart-card__chart')).not.toHaveClass('chart-card__chart--refreshing')
  })

  it('runs the query again when the page refreshes every chart', async () => {
    const { rerender } = render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart/ })

    rerender(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={1}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    expect(global.fetch.mock.calls[0][0]).toBe(DATA_URL)
    expect(global.fetch.mock.calls[1][0]).toBe(`${DATA_URL}?fresh=true`)
  })

  it('says how old the data is, with the exact time of the reading on hover', async () => {
    const fetchedAt = new Date(Date.now() - 3 * 60_000).toISOString()
    global.fetch = vi.fn().mockResolvedValue(respond({ ...RESULT, fetchedAt }))

    render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    const age = await screen.findByText('Updated 3 min ago')
    expect(age).toHaveAttribute('datetime', fetchedAt)
    expect(age).toHaveAttribute(
      'title',
      new Date(fetchedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    )
  })

  it('brings the age of the data up to date right after a refresh', async () => {
    const stale = new Date(Date.now() - 2 * 60 * 60_000).toISOString()
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ ...RESULT, fetchedAt: stale }))
      .mockImplementationOnce(async () => respond({ ...RESULT, fetchedAt: new Date().toISOString() }))
    const user = userEvent.setup()
    render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(await screen.findByText('Updated 2 h ago')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Refresh data' }))

    expect(await screen.findByText('Updated just now')).toBeInTheDocument()
    expect(screen.queryByText('Updated 2 h ago')).toBeNull()
  })

  it('says nothing about the age of the data when the server does not report it', async () => {
    render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart/ })

    expect(screen.queryByText(/^Updated/)).toBeNull()
  })

  it('stops showing the age of the old data while the card is generated again', async () => {
    const fetchedAt = new Date(Date.now() - 3 * 60_000).toISOString()
    global.fetch = vi.fn().mockResolvedValue(respond({ ...RESULT, fetchedAt }))
    const { rerender } = render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByText('Updated 3 min ago')

    rerender(
      <ChartCard
        card={{ ...READY_CARD, status: 'generating', step: 'Rewriting the query' }}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByRole('status')).toHaveTextContent('Rewriting the query…')
    expect(screen.queryByText(/^Updated/)).toBeNull()
  })

  it('does not repeat the prompt under the skeleton while it is still the title of the card', () => {
    const prompt = 'Orders per week over the last 3 months'
    render(
      <ChartCard
        card={{ ...GENERATING_CARD, title: prompt, prompt }}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getAllByText(prompt)).toHaveLength(1)
  })

  it('leaves the label of a number tile out when it only repeats the title of the card', async () => {
    const label = 'Returns this month'
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        respond({ columns: [{ name: 'returns', kind: 'number' }], rows: [{ returns: 778 }], truncated: false })
      )
    render(
      <ChartCard
        card={{
          ...READY_CARD,
          title: label,
          chart: { type: 'number', xKey: null, groupKey: null, series: [{ key: 'returns', label }], stacked: false },
        }}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(await screen.findByText('778')).toBeInTheDocument()
    expect(screen.getAllByText(label)).toHaveLength(1)
  })

  it('hides the age of the data while the deletion is being confirmed', async () => {
    const fetchedAt = new Date(Date.now() - 3 * 60_000).toISOString()
    global.fetch = vi.fn().mockResolvedValue(respond({ ...RESULT, fetchedAt }))
    const user = userEvent.setup()
    render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByText('Updated 3 min ago')

    await user.click(screen.getByRole('button', { name: 'Delete chart' }))

    expect(screen.queryByText(/^Updated/)).toBeNull()
  })

  it('opens the editor with the card', async () => {
    const onEdit = vi.fn()
    const user = userEvent.setup()
    render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={onEdit}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Edit chart and SQL' }))

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith(READY_CARD)
  })

  it('shows the message of the database when the query fails and offers to edit the SQL', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ error: 'relation "weekly_returns" does not exist' }, 422))
    const onEdit = vi.fn()
    const user = userEvent.setup()
    render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={onEdit}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(await screen.findByText('The query failed')).toBeInTheDocument()
    expect(screen.getByText('relation "weekly_returns" does not exist')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Edit SQL' }))

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith(READY_CARD)
  })

  it('logs out when the data is requested with an expired session', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({}, 401))
    const onLogout = vi.fn()
    render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={onLogout}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('The query failed')).toBeNull()
  })

  it('shows the progress of a card that is being generated and only lets it be deleted', () => {
    render(
      <ChartCard
        card={GENERATING_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByRole('status')).toHaveTextContent('Reading the columns of returns…')
    expect(screen.getByText('Returns per week over the last 3 months')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete chart' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh data' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit chart and SQL' })).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('says it is thinking before the first step of the generation', () => {
    render(
      <ChartCard
        card={{ ...GENERATING_CARD, step: null }}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByRole('status')).toHaveTextContent('Thinking…')
  })

  it('explains why a card failed and retries it', async () => {
    const failed = { ...READY_CARD, status: 'failed', error: 'I could not find a table with orders.' }
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(
      <ChartCard
        card={failed}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={onRetry}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByText('I could not find a table with orders.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh data' })).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith(failed)
  })

  it('offers to edit the SQL of a failed card that has a query', async () => {
    const failed = { ...READY_CARD, status: 'failed', error: 'The change could not be applied.' }
    const onEdit = vi.fn()
    const user = userEvent.setup()
    render(
      <ChartCard
        card={failed}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={onEdit}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Edit SQL' }))

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith(failed)
  })

  it('falls back to a generic message and hides Edit SQL when a failed card never got a query', () => {
    render(
      <ChartCard
        card={{ ...GENERATING_CARD, status: 'failed', step: null, error: null }}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByText('The chart could not be generated.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit SQL' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit chart and SQL' })).toBeInTheDocument()
  })

  it('spreads the drag handle of the grid on its header', async () => {
    const onKeyDown = vi.fn()
    const handleProps = { role: 'group', tabIndex: 0, 'aria-label': 'Move chart', 'data-grid-handle': '', onKeyDown }
    const user = userEvent.setup()
    render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={handleProps}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    const handle = screen.getByRole('group', { name: 'Move chart' })

    expect(handle).toHaveAttribute('data-grid-handle')
    expect(within(handle).getByRole('heading', { name: 'Returns per week' })).toBeInTheDocument()
    expect(within(handle).getByRole('button', { name: 'Delete chart' })).toBeInTheDocument()

    handle.focus()
    await user.keyboard('{ArrowRight}')

    expect(onKeyDown).toHaveBeenCalledTimes(1)
  })

  it('asks before deleting and deletes the card once confirmed', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={onDelete}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Delete chart' }))

    expect(screen.getByRole('group', { name: 'Delete this chart?' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete chart' })).toBeNull()
    expect(onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith(READY_CARD)
  })

  it('keeps the card when the deletion is not confirmed', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(
      <ChartCard
        card={READY_CARD}
        token="tok"
        onLogout={vi.fn()}
        refreshKey={0}
        dragHandleProps={{}}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onDelete={onDelete}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Delete chart' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'Delete this chart?' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete chart' })).toBeInTheDocument()
  })
})
