import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ChartView from './ChartView.jsx'

const harness = vi.hoisted(() => ({ chartData: [] }))

vi.mock('recharts', () => {
  function chartOf(testId) {
    return ({ children, data, role, 'aria-label': ariaLabel }) => {
      harness.chartData.push(data)

      return (
        <div data-testid={testId} role={role} aria-label={ariaLabel}>
          {children}
        </div>
      )
    }
  }

  function markOf(testId) {
    return ({ isAnimationActive }) => <div data-testid={testId} data-animated={String(isAnimationActive)} />
  }

  return {
    ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
    BarChart: chartOf('bar-chart'),
    LineChart: chartOf('line-chart'),
    AreaChart: chartOf('area-chart'),
    PieChart: chartOf('pie-chart'),
    BarStack: ({ children }) => <div data-testid="bar-stack">{children}</div>,
    Bar: markOf('bar'),
    Line: markOf('line'),
    Area: markOf('area'),
    Pie: markOf('pie'),
    CartesianGrid: () => <div />,
    XAxis: () => <div />,
    YAxis: () => <div />,
    Tooltip: () => <div />,
  }
})

const COLUMNS = [
  { name: 'week', kind: 'date' },
  { name: 'returns', kind: 'number' },
  { name: 'refunds', kind: 'number' },
]

const ROWS = [
  { week: '2026-03-03T00:00:00.000Z', returns: 12949, refunds: 7 },
  { week: '2026-03-10T00:00:00.000Z', returns: 31, refunds: 9 },
]

const SERIES = [{ key: 'returns', label: 'Returns' }]

function chartOf(overrides) {
  return { type: 'bar', xKey: 'week', groupKey: null, series: SERIES, stacked: false, ...overrides }
}

describe('ChartView', () => {
  beforeEach(() => {
    harness.chartData = []
  })

  afterEach(() => {
    delete window.matchMedia
  })

  it('renders a bar chart inside a responsive container', () => {
    render(<ChartView chart={chartOf({})} columns={COLUMNS} rows={ROWS} />)

    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Bar chart of Returns with 2 points' })).toBeInTheDocument()
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  it('renders a row chart as horizontal bars', () => {
    render(<ChartView chart={chartOf({ type: 'row' })} columns={COLUMNS} rows={ROWS} />)

    expect(screen.getByRole('img', { name: 'Horizontal bar chart of Returns with 2 points' })).toBeInTheDocument()
  })

  it('renders a line chart', () => {
    render(<ChartView chart={chartOf({ type: 'line' })} columns={COLUMNS} rows={ROWS} />)

    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    expect(screen.getByTestId('line')).toBeInTheDocument()
  })

  it('renders an area chart', () => {
    render(<ChartView chart={chartOf({ type: 'area' })} columns={COLUMNS} rows={ROWS} />)

    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    expect(screen.getByTestId('area')).toBeInTheDocument()
  })

  it('renders a pie as a donut with its legend', () => {
    render(<ChartView chart={chartOf({ type: 'pie' })} columns={COLUMNS} rows={ROWS} />)

    expect(screen.getByRole('img', { name: 'Donut chart of Returns with 2 slices' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Legend' })).toBeInTheDocument()
  })

  it('renders a number as a stat tile, not as a chart', () => {
    render(<ChartView chart={chartOf({ type: 'number', xKey: null })} columns={COLUMNS} rows={ROWS} />)

    expect(screen.getByText('Returns')).toBeInTheDocument()
    expect(screen.getByText('12.9K')).toHaveAttribute('title', '12,949')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('drops the label of a number that only repeats the title of its card', () => {
    render(
      <ChartView chart={chartOf({ type: 'number', xKey: null })} columns={COLUMNS} rows={ROWS} title=" returns " />
    )

    expect(screen.queryByText('Returns')).not.toBeInTheDocument()
    expect(screen.getByText('12.9K')).toBeInTheDocument()
  })

  it('keeps the label of a number when the title of its card says something else', () => {
    render(
      <ChartView
        chart={chartOf({ type: 'number', xKey: null })}
        columns={COLUMNS}
        rows={ROWS}
        title="Returns this month"
      />
    )

    expect(screen.getByText('Returns')).toBeInTheDocument()
  })

  it('renders the table type as a data table', () => {
    render(<ChartView chart={chartOf({ type: 'table', xKey: null, series: [] })} columns={COLUMNS} rows={ROWS} />)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map(header => header.textContent)).toEqual([
      'week',
      'returns',
      'refunds',
    ])
  })

  it('falls back to the table when there is no chart yet', () => {
    render(<ChartView chart={null} columns={COLUMNS} rows={ROWS} />)

    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('falls back to the table for a type it does not know', () => {
    render(<ChartView chart={chartOf({ type: 'radar' })} columns={COLUMNS} rows={ROWS} />)

    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('says that no rows were returned instead of drawing an empty chart', () => {
    render(<ChartView chart={chartOf({})} columns={COLUMNS} rows={[]} />)

    expect(screen.getByText('No rows returned')).toHaveClass('chart-view__state')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('says which problem it has when the chart points at a column the query dropped', () => {
    render(<ChartView chart={chartOf({ series: [{ key: 'gone', label: 'Gone' }] })} columns={COLUMNS} rows={ROWS} />)

    expect(screen.getByText('This chart needs columns the query no longer returns')).toHaveClass('chart-view__state')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('animates the entry by default, also where matchMedia does not exist', () => {
    render(<ChartView chart={chartOf({})} columns={COLUMNS} rows={ROWS} />)

    expect(screen.getByTestId('bar')).toHaveAttribute('data-animated', 'true')
  })

  it('animates when the user has not asked for reduced motion', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })

    render(<ChartView chart={chartOf({ type: 'pie' })} columns={COLUMNS} rows={ROWS} />)

    expect(screen.getByTestId('pie')).toHaveAttribute('data-animated', 'true')
  })

  it('draws statically when the user prefers reduced motion', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })

    render(<ChartView chart={chartOf({})} columns={COLUMNS} rows={ROWS} />)

    expect(screen.getByTestId('bar')).toHaveAttribute('data-animated', 'false')
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
  })

  it('hands the chart the same shaped data on an unrelated re-render', () => {
    const chart = chartOf({})
    const { rerender } = render(<ChartView chart={chart} columns={COLUMNS} rows={ROWS} />)

    rerender(<ChartView chart={chart} columns={COLUMNS} rows={ROWS} />)

    expect(harness.chartData.length).toBeGreaterThan(1)
    expect(harness.chartData.at(-1)).toBe(harness.chartData[0])
  })

  it('shapes the data again when the rows change', () => {
    const chart = chartOf({})
    const { rerender } = render(<ChartView chart={chart} columns={COLUMNS} rows={ROWS} />)

    rerender(<ChartView chart={chart} columns={COLUMNS} rows={ROWS.slice(0, 1)} />)

    expect(harness.chartData.at(-1)).toHaveLength(1)
    expect(screen.getByRole('img', { name: 'Bar chart of Returns with 1 point' })).toBeInTheDocument()
  })
})
