import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import ChartLegend from './ChartLegend.jsx'

const SERIES = [
  { key: 's0', label: 'Returns', color: 'var(--chart-1)' },
  { key: 's1', label: 'Refunds', color: 'var(--chart-2)' },
  { key: 'other', label: 'Other', color: 'var(--chart-other)' },
]

const SLICES = [
  { key: 's0', label: 'Wrong size', value: 431, share: 0.339, color: 'var(--chart-1)', fill: 'var(--chart-1)' },
  {
    key: 's1',
    label: 'Damaged in transit',
    value: 12345.6,
    share: 0.173,
    color: 'var(--chart-2)',
    fill: 'var(--chart-2)',
  },
]

describe('ChartLegend', () => {
  it('lists one entry per series in the given order', () => {
    render(<ChartLegend items={SERIES} />)

    const legend = screen.getByRole('list', { name: 'Legend' })

    expect(
      within(legend)
        .getAllByRole('listitem')
        .map(item => item.textContent)
    ).toEqual(['Returns', 'Refunds', 'Other'])
  })

  it('puts the series colour on the swatch and keeps the label in text ink', () => {
    render(<ChartLegend items={SERIES} />)

    const items = screen.getAllByRole('listitem')

    expect(items[0].querySelector('.chart-legend__swatch')).toHaveStyle({ backgroundColor: 'var(--chart-1)' })
    expect(items[2].querySelector('.chart-legend__swatch')).toHaveStyle({ backgroundColor: 'var(--chart-other)' })
    expect(screen.getByText('Returns')).not.toHaveAttribute('style')
  })

  it('wraps with square swatches by default', () => {
    render(<ChartLegend items={SERIES} />)

    expect(screen.getByRole('list', { name: 'Legend' })).toHaveClass('chart-legend--wrap')
    expect(document.querySelectorAll('.chart-legend__swatch--rect')).toHaveLength(3)
  })

  it('mirrors a line chart with stroke keys', () => {
    render(<ChartLegend items={SERIES} mark="line" />)

    expect(document.querySelectorAll('.chart-legend__swatch--line')).toHaveLength(3)
    expect(document.querySelectorAll('.chart-legend__swatch--rect')).toHaveLength(0)
  })

  it('keeps the full label reachable when it is clipped', () => {
    render(<ChartLegend items={SERIES} />)

    expect(screen.getAllByRole('listitem')[1]).toHaveAttribute('title', 'Refunds')
  })

  it('leaves the figures out for plain series', () => {
    render(<ChartLegend items={SERIES} />)

    expect(document.querySelector('.chart-legend__value')).toBeNull()
    expect(document.querySelector('.chart-legend__share')).toBeNull()
  })

  it('lists each slice with its value and its share', () => {
    render(<ChartLegend items={SLICES} layout="list" />)

    const items = screen.getAllByRole('listitem')

    expect(screen.getByRole('list', { name: 'Legend' })).toHaveClass('chart-legend--list')
    expect(within(items[0]).getByText('431')).toHaveClass('chart-legend__value')
    expect(within(items[0]).getByText('33.9%')).toHaveClass('chart-legend__share')
    expect(items[1]).toHaveTextContent('Damaged in transit12,345.617.3%')
  })
})
