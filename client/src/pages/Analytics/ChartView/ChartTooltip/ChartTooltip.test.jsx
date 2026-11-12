import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import ChartTooltip from './ChartTooltip.jsx'

const SERIES = [
  { key: 's0', label: 'Web', color: 'var(--chart-1)' },
  { key: 's1', label: 'Slack', color: 'var(--chart-2)' },
  { key: 's2', label: 'MCP', color: 'var(--chart-3)' },
]

describe('ChartTooltip', () => {
  it('renders nothing while the pointer is away from the chart', () => {
    const { container } = render(<ChartTooltip active={false} payload={[]} series={SERIES} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the chart reports no payload', () => {
    const { container } = render(<ChartTooltip active payload={undefined} series={SERIES} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('lists every series at that x under the formatted x, in series order', () => {
    const datum = { x: 'Sep 6', label: 'Sep 6, 2026', s0: 12345.6, s1: 74, s2: 57 }
    const payload = [
      { dataKey: 's2', name: 'MCP', value: 57, color: 'var(--chart-3)', payload: datum },
      { dataKey: 's1', name: 'Slack', value: 74, color: 'var(--chart-2)', payload: datum },
      { dataKey: 's0', name: 'Web', value: 12345.6, color: 'var(--chart-1)', payload: datum },
    ]

    render(<ChartTooltip active payload={payload} series={SERIES} />)

    const rows = screen.getAllByRole('listitem')

    expect(screen.getByText('Sep 6, 2026')).toHaveClass('chart-tooltip__title')
    expect(rows.map(row => row.textContent)).toEqual(['Web12,345.6', 'Slack74', 'MCP57'])
    expect(within(rows[0]).getByText('12,345.6')).toHaveClass('chart-tooltip__value')
    expect(within(rows[0]).getByText('Web')).toHaveClass('chart-tooltip__label')
  })

  it('keys each row with a stroke in the series colour and never colours the text', () => {
    const datum = { x: 'Sep 6', label: 'Sep 6, 2026', s0: 169, s1: 74, s2: 57 }

    render(<ChartTooltip active payload={[{ dataKey: 's0', value: 169, payload: datum }]} series={SERIES} />)

    const rows = screen.getAllByRole('listitem')

    expect(rows[1].querySelector('.chart-tooltip__key')).toHaveStyle({ backgroundColor: 'var(--chart-2)' })
    expect(within(rows[1]).getByText('Slack')).not.toHaveAttribute('style')
    expect(within(rows[1]).getByText('74')).not.toHaveAttribute('style')
  })

  it('leaves out a series that has no value at that x', () => {
    const datum = { x: 'Sep 6', label: 'Sep 6, 2026', s0: 169, s1: null }

    render(<ChartTooltip active payload={[{ dataKey: 's0', value: 169, payload: datum }]} series={SERIES} />)

    expect(screen.getAllByRole('listitem').map(row => row.textContent)).toEqual(['Web169'])
  })

  it('shows the slice name, its value and its share for a pie', () => {
    const slice = { key: 's1', label: 'Damaged in transit', value: 220, share: 0.173, color: 'var(--chart-2)' }
    const payload = [{ dataKey: 'value', name: 'Damaged in transit', value: 220, payload: slice }]

    render(<ChartTooltip active payload={payload} series={[{ key: 'value', label: 'Returns' }]} />)

    const row = screen.getByRole('listitem')

    expect(screen.getByText('Damaged in transit')).toHaveClass('chart-tooltip__title')
    expect(row).toHaveTextContent('Returns22017.3%')
    expect(row.querySelector('.chart-tooltip__key')).toHaveStyle({ backgroundColor: 'var(--chart-2)' })
  })

  it('renders labels as text, never as markup', () => {
    const datum = { x: '<b>x</b>', label: '<img src=x onerror=alert(1)>', s0: 1 }
    const series = [{ key: 's0', label: '<script>alert(1)</script>', color: 'var(--chart-1)' }]

    render(<ChartTooltip active payload={[{ dataKey: 's0', value: 1, payload: datum }]} series={series} />)

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })
})
