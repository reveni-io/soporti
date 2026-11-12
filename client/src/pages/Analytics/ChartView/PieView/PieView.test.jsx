import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import PieView from './PieView.jsx'
import { shapeChart } from '../chart-data.js'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  PieChart: ({ children, role, 'aria-label': ariaLabel }) => (
    <div data-testid="pie-chart" role={role} aria-label={ariaLabel}>
      {children}
    </div>
  ),
  Pie: props => (
    <div
      data-testid="pie"
      data-key={props.dataKey}
      data-name-key={props.nameKey}
      data-fills={props.data.map(slice => slice.fill).join(' ')}
      data-inner-radius={props.innerRadius}
      data-outer-radius={props.outerRadius}
      data-start-angle={props.startAngle}
      data-end-angle={props.endAngle}
      data-stroke={props.stroke}
      data-stroke-width={props.strokeWidth}
      data-label={String(props.label)}
      data-animated={String(props.isAnimationActive)}
      data-begin={props.animationBegin}
      data-duration={props.animationDuration}
    />
  ),
  Tooltip: ({ content }) => (
    <div data-testid="tooltip">
      <content.type
        series={content.props.series}
        active
        payload={[{ payload: { label: 'Damaged', value: 30, share: 0.3, color: 'var(--chart-2)' } }]}
      />
    </div>
  ),
}))

const COLUMNS = [
  { name: 'reason', kind: 'text' },
  { name: 'returns', kind: 'number' },
]

const CHART = {
  type: 'pie',
  xKey: 'reason',
  groupKey: null,
  series: [{ key: 'returns', label: 'Returns' }],
  stacked: false,
}

function modelOf(rows) {
  return shapeChart(CHART, COLUMNS, rows)
}

const THREE_ROWS = [
  { reason: 'Size', returns: 60 },
  { reason: 'Damaged', returns: 30 },
  { reason: 'Late', returns: 10 },
]

describe('PieView', () => {
  it('draws a donut from the values, starting at twelve o clock', () => {
    render(<PieView model={modelOf(THREE_ROWS)} isAnimated />)

    const pie = screen.getByTestId('pie')

    expect(pie).toHaveAttribute('data-key', 'value')
    expect(pie).toHaveAttribute('data-name-key', 'label')
    expect(pie).toHaveAttribute('data-inner-radius', '64%')
    expect(pie).toHaveAttribute('data-outer-radius', '100%')
    expect(pie).toHaveAttribute('data-start-angle', '90')
    expect(pie).toHaveAttribute('data-end-angle', '-270')
  })

  it('separates the slices with a two pixel gap in the surface colour', () => {
    render(<PieView model={modelOf(THREE_ROWS)} isAnimated />)

    expect(screen.getByTestId('pie')).toHaveAttribute('data-stroke', 'var(--bg-surface)')
    expect(screen.getByTestId('pie')).toHaveAttribute('data-stroke-width', '2')
  })

  it('paints the slices with the chart slots in order', () => {
    render(<PieView model={modelOf(THREE_ROWS)} isAnimated />)

    expect(screen.getByTestId('pie')).toHaveAttribute('data-fills', 'var(--chart-1) var(--chart-2) var(--chart-3)')
  })

  it('folds the tail into a neutral Other slice', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((reason, index) => ({ reason, returns: 80 - index * 10 }))

    render(<PieView model={modelOf(rows)} isAnimated />)

    const items = within(screen.getByRole('list', { name: 'Legend' })).getAllByRole('listitem')

    expect(screen.getByTestId('pie').getAttribute('data-fills').split(' ')).toEqual([
      'var(--chart-1)',
      'var(--chart-2)',
      'var(--chart-3)',
      'var(--chart-4)',
      'var(--chart-5)',
      'var(--chart-other)',
    ])
    expect(items).toHaveLength(6)
    expect(items[5]).toHaveTextContent('Other6016.7%')
  })

  it('puts no label on the slices and lists name, value and share in the legend instead', () => {
    render(<PieView model={modelOf(THREE_ROWS)} isAnimated />)

    const legend = screen.getByRole('list', { name: 'Legend' })

    expect(screen.getByTestId('pie')).toHaveAttribute('data-label', 'undefined')
    expect(legend).toHaveClass('chart-legend--list')
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map(item => item.textContent)
    ).toEqual(['Size6060%', 'Damaged3030%', 'Late1010%'])
  })

  it('summarises the chart for assistive technology', () => {
    render(<PieView model={modelOf(THREE_ROWS)} isAnimated />)

    expect(screen.getByRole('img', { name: 'Donut chart of Returns with 3 slices' })).toBeInTheDocument()
  })

  it('names the hovered slice with its value and share in the tooltip', () => {
    render(<PieView model={modelOf(THREE_ROWS)} isAnimated />)

    const tooltip = screen.getByTestId('tooltip')

    expect(within(tooltip).getByText('Damaged')).toHaveClass('chart-tooltip__title')
    expect(within(tooltip).getByRole('listitem')).toHaveTextContent('Returns3030%')
  })

  it('plays a short entry animation without the default delay', () => {
    render(<PieView model={modelOf(THREE_ROWS)} isAnimated />)

    expect(screen.getByTestId('pie')).toHaveAttribute('data-animated', 'true')
    expect(screen.getByTestId('pie')).toHaveAttribute('data-begin', '0')
    expect(screen.getByTestId('pie')).toHaveAttribute('data-duration', '400')
  })

  it('draws statically when animation is off', () => {
    render(<PieView model={modelOf(THREE_ROWS)} isAnimated={false} />)

    expect(screen.getByTestId('pie')).toHaveAttribute('data-animated', 'false')
  })
})
