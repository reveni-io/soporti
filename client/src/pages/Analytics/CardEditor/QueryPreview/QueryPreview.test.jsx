import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import QueryPreview from './QueryPreview.jsx'

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

const CHART = {
  type: 'line',
  xKey: 'week',
  groupKey: null,
  series: [{ key: 'returns', label: 'Returns' }],
  stacked: false,
}
const PREVIEW = {
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

describe('QueryPreview', () => {
  it('invites to run a query while there is nothing to show', () => {
    render(<QueryPreview chart={null} preview={null} isRunning={false} />)

    expect(screen.getByText('Write a query and run it to see the result.')).toBeInTheDocument()
  })

  it('says the query is running before the first result', () => {
    render(<QueryPreview chart={CHART} preview={null} isRunning />)

    expect(screen.getByText('Running the query…')).toBeInTheDocument()
  })

  it('draws the chart and lists the rows of the result', () => {
    render(<QueryPreview chart={CHART} preview={PREVIEW} isRunning={false} />)

    expect(screen.getByRole('img', { name: /^Line chart of Returns/ })).toBeInTheDocument()
    expect(screen.getByText('Result').parentElement).toHaveTextContent('Result2 rows')
    expect(within(screen.getByRole('table')).getByRole('columnheader', { name: 'returns' })).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByRole('cell', { name: '51' })).toBeInTheDocument()
  })

  it('counts a single row in the singular', () => {
    render(<QueryPreview chart={CHART} preview={{ ...PREVIEW, rows: PREVIEW.rows.slice(0, 1) }} isRunning={false} />)

    expect(screen.getByText('Result').parentElement).toHaveTextContent('Result1 row')
  })

  it('says when only the first rows are shown', () => {
    const rows = Array.from({ length: 2000 }, (_, index) => ({ week: '2026-08-03T00:00:00.000Z', returns: index }))

    render(<QueryPreview chart={CHART} preview={{ ...PREVIEW, rows, truncated: true }} isRunning={false} />)

    expect(screen.getByText('Result').parentElement).toHaveTextContent('Result2,000 rows · first 2,000 shown')
  })

  it('keeps the previous result on screen, dimmed, while the query runs again', () => {
    const { container } = render(<QueryPreview chart={CHART} preview={PREVIEW} isRunning />)

    expect(container.querySelector('.query-preview')).toHaveClass('query-preview--running')
    expect(screen.getByRole('img', { name: /^Line chart of Returns/ })).toBeInTheDocument()
  })
})
