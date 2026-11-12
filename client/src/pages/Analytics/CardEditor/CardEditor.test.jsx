import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CardEditor from './CardEditor.jsx'

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
const QUERY_URL = '/api/analytics/query'
const SQL = 'SELECT week, country, returns, refunds FROM weekly_returns'
const BAR = {
  type: 'bar',
  xKey: 'week',
  groupKey: null,
  series: [{ key: 'returns', label: 'Returns' }],
  stacked: false,
}
const CARD = {
  id: CARD_ID,
  title: 'Returns per week',
  prompt: 'Returns per week over the last 3 months',
  sql: SQL,
  chart: BAR,
  layout: { x: 0, y: 0, w: 6, h: 4 },
  status: 'ready',
  step: null,
  error: null,
}
const UNQUERIED_CARD = { ...CARD, sql: null, chart: null, status: 'failed', error: 'The chart could not be generated.' }
const RESULT = {
  columns: [
    { name: 'week', kind: 'date' },
    { name: 'country', kind: 'text' },
    { name: 'returns', kind: 'number' },
    { name: 'refunds', kind: 'number' },
  ],
  rows: [
    { week: '2026-08-03T00:00:00.000Z', country: 'ES', returns: 10, refunds: 1 },
    { week: '2026-08-03T00:00:00.000Z', country: 'FR', returns: 5, refunds: 2 },
    { week: '2026-08-10T00:00:00.000Z', country: 'ES', returns: 7, refunds: 3 },
    { week: '2026-08-10T00:00:00.000Z', country: 'FR', returns: 2, refunds: 1 },
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

function queryBody(index) {
  return JSON.parse(global.fetch.mock.calls[index][1].body)
}

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn().mockResolvedValue(respond({ ...RESULT, chart: BAR }))
})

describe('CardEditor', () => {
  it('runs the query of the card once on open to load the preview', async () => {
    const pending = deferred()
    global.fetch = vi.fn().mockReturnValue(pending.promise)

    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByRole('dialog', { name: 'Edit chart' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Returns per week')
    expect(screen.getByRole('textbox', { name: 'SQL' })).toHaveValue(SQL)
    expect(screen.getByText('Running the query…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Running…' })).toBeDisabled()

    await act(async () => pending.resolve(respond({ ...RESULT, chart: BAR })))

    expect(screen.getByRole('img', { name: /^Bar chart of Returns with 4 points/ })).toBeInTheDocument()
    expect(screen.getByText('Result').parentElement).toHaveTextContent('Result4 rows')
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(QUERY_URL)
    expect(global.fetch.mock.calls[0][1].method).toBe('POST')
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
    expect(queryBody(0)).toEqual({ sql: SQL, chart: BAR })
  })

  it('waits for a query when the card never got one', async () => {
    render(
      <CardEditor
        card={UNQUERIED_CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await act(async () => {})

    expect(global.fetch).not.toHaveBeenCalled()
    expect(screen.getByText('Write a query and run it to see the result.')).toBeInTheDocument()
    expect(screen.getByText('Run the query to choose how to draw it.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'SQL' })).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('runs the edited query and adopts the chart the server reconciled', async () => {
    const line = { ...BAR, type: 'line', series: [{ key: 'refunds', label: 'Refunds' }] }
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ ...RESULT, chart: BAR }))
      .mockResolvedValueOnce(respond({ ...RESULT, rows: RESULT.rows.slice(0, 2), chart: line }))
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.type(screen.getByRole('textbox', { name: 'SQL' }), ' LIMIT 2')
    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(await screen.findByRole('img', { name: /^Line chart of Refunds with 2 points/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Line' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('checkbox', { name: 'refunds' })).toBeChecked()
    expect(screen.getByText('Result').parentElement).toHaveTextContent('Result2 rows')
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(queryBody(1)).toEqual({ sql: `${SQL} LIMIT 2`, chart: BAR })
  })

  it('runs the query with Ctrl+Enter from the SQL field', async () => {
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.click(screen.getByRole('textbox', { name: 'SQL' }))
    await user.keyboard('{Control>}{Enter}{/Control}')

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    expect(queryBody(1)).toEqual({ sql: SQL, chart: BAR })
  })

  it('writes the first query of a card that never got one', async () => {
    const table = { type: 'table', xKey: null, groupKey: null, series: [], stacked: false }
    global.fetch = vi.fn().mockResolvedValue(respond({ ...RESULT, chart: table }))
    const user = userEvent.setup()
    render(
      <CardEditor
        card={UNQUERIED_CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    await user.type(screen.getByRole('textbox', { name: 'SQL' }), 'SELECT 1')
    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(await screen.findByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true')
    expect(queryBody(0)).toEqual({ sql: 'SELECT 1', chart: null })
    expect(screen.getAllByRole('table')).toHaveLength(2)
  })

  it('shows the message of the database when a run fails and keeps the previous preview', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ ...RESULT, chart: BAR }))
      .mockResolvedValueOnce(respond({ error: 'syntax error at or near "LIMITT"' }, 422))
    const onLogout = vi.fn()
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={onLogout}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.type(screen.getByRole('textbox', { name: 'SQL' }), ' LIMITT 2')
    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('syntax error at or near "LIMITT"')
    expect(screen.getByRole('img', { name: /^Bar chart of Returns with 4 points/ })).toBeInTheDocument()
    expect(screen.getByText('Result').parentElement).toHaveTextContent('Result4 rows')
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled()
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('clears the message of the database on the next run', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ error: 'relation "weekly_returns" does not exist' }, 422))
      .mockResolvedValueOnce(respond({ ...RESULT, chart: BAR }))
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('relation "weekly_returns" does not exist')
    expect(screen.getByText('Write a query and run it to see the result.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(await screen.findByRole('img', { name: /^Bar chart of Returns/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('logs out when the query is run with an expired session', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({}, 401))
    const onLogout = vi.fn()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={onLogout}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('redraws the preview as another type without a request', async () => {
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.click(screen.getByRole('button', { name: 'Line' }))
    expect(screen.getByRole('img', { name: /^Line chart of Returns/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bars' }))
    expect(screen.getByRole('img', { name: /^Horizontal bar chart of Returns/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pie' }))
    expect(screen.getByRole('img', { name: /^Donut chart of Returns/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getAllByRole('table')).toHaveLength(2)

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('plots a second value, stacks it and splits a value by a column in the preview', async () => {
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.click(screen.getByRole('checkbox', { name: 'refunds' }))
    expect(screen.getByRole('img', { name: /^Bar chart of Returns and Refunds/ })).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Stacked' }))
    expect(screen.getByRole('img', { name: /^Stacked bar chart of Returns and Refunds/ })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Group by' }), 'country')
    expect(screen.getByRole('img', { name: /^Stacked bar chart of ES and FR with 2 points/ })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Value' })).toHaveValue('returns')

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('saves the title, the query and the chart as drawn, then closes', async () => {
    const onSave = vi.fn().mockResolvedValue()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={onClose}
        onSave={onSave}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.clear(screen.getByRole('textbox', { name: 'Title' }))
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Returns by country ')
    await user.type(screen.getByRole('textbox', { name: 'SQL' }), ' ORDER BY 1')
    await user.selectOptions(screen.getByRole('combobox', { name: 'X axis' }), 'country')
    await user.click(screen.getByRole('button', { name: 'Area' }))
    await user.click(screen.getByRole('checkbox', { name: 'Stacked' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(CARD_ID, {
      title: 'Returns by country',
      sql: `${SQL} ORDER BY 1`,
      chart: { ...BAR, type: 'area', xKey: 'country', stacked: true },
    })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('shows why a save was rejected and stays open', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('column "totl" does not exist'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={onClose}
        onSave={onSave}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('column "totl" does not exist')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('cannot save twice while the card is being saved', async () => {
    const saving = deferred()
    const onSave = vi.fn().mockReturnValue(saving.promise)
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={onClose}
        onSave={onSave}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => saving.resolve())

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['title', 'Title'],
    ['query', 'SQL'],
  ])('cannot save without a %s', async (_field, label) => {
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    await user.clear(screen.getByRole('textbox', { name: label }))

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('limits the title to the length the server accepts', async () => {
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute('maxlength', '120')
  })

  it('asks the assistant for a change and closes', async () => {
    const onRevise = vi.fn().mockResolvedValue()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={onClose}
        onSave={vi.fn()}
        onRevise={onRevise}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.type(screen.getByRole('textbox', { name: 'Ask for a change' }), 'make it monthly')
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    expect(onRevise).toHaveBeenCalledTimes(1)
    expect(onRevise).toHaveBeenCalledWith(CARD_ID, 'make it monthly')
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('shows why a change could not be requested and stays open', async () => {
    const onRevise = vi.fn().mockRejectedValue(new Error('The chart is already being generated.'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={onClose}
        onSave={vi.fn()}
        onRevise={onRevise}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.type(screen.getByRole('textbox', { name: 'Ask for a change' }), 'make it monthly{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('The chart is already being generated.')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('asks before deleting, then deletes the card and closes', async () => {
    const onDelete = vi.fn().mockResolvedValue()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={onClose}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={onDelete}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.click(screen.getByRole('button', { name: 'Delete chart' }))

    expect(screen.getByRole('group', { name: 'Delete this chart?' })).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith(CARD_ID)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('cannot save or delete again while the card is being deleted', async () => {
    const deletion = deferred()
    const onDelete = vi.fn().mockReturnValue(deletion.promise)
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={onClose}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={onDelete}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.click(screen.getByRole('button', { name: 'Delete chart' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(screen.getByRole('button', { name: 'Yes, delete' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    await act(async () => deletion.resolve())

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('replaces the reason a save was rejected with the outcome of the next attempt', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('column "totl" does not exist'))
    const onDelete = vi.fn().mockRejectedValue(new Error('Failed to delete the chart'))
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={vi.fn()}
        onSave={onSave}
        onRevise={vi.fn()}
        onDelete={onDelete}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('column "totl" does not exist')

    await user.click(screen.getByRole('button', { name: 'Delete chart' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to delete the chart'))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('keeps the card when the deletion is not confirmed', async () => {
    const onDelete = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={onClose}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={onDelete}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.click(screen.getByRole('button', { name: 'Delete chart' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete chart' })).toBeInTheDocument()
  })

  it('shows why the card could not be deleted and stays open', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('Failed to delete the chart'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={onClose}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={onDelete}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.click(screen.getByRole('button', { name: 'Delete chart' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to delete the chart')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={onClose}
        onSave={onSave}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it.each([['Close'], ['Cancel']])('closes from the %s button without saving', async name => {
    const onClose = vi.fn()
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={onClose}
        onSave={onSave}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.click(screen.getByRole('button', { name }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('closes when the overlay is clicked but not when the editor is', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <CardEditor
        card={CARD}
        token="tok"
        onLogout={vi.fn()}
        onClose={onClose}
        onSave={vi.fn()}
        onRevise={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    await screen.findByRole('img', { name: /^Bar chart of Returns/ })

    await user.click(screen.getByRole('dialog', { name: 'Edit chart' }))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(container.querySelector('.modal-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
