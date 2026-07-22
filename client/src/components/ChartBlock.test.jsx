import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ChartBlock from './ChartBlock.jsx'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  AreaChart: ({ children }) => <div data-testid="area-chart">{children}</div>,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  Line: () => <div data-testid="line" />,
  Area: () => <div data-testid="area" />,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
}))

describe('ChartBlock', () => {
  it('renders bar chart', () => {
    const config = JSON.stringify({
      type: 'bar',
      title: 'Sales',
      data: [{ name: 'Jan', value: 100 }],
      series: [{ key: 'value', label: 'Sales' }],
    })

    render(<ChartBlock data={config} />)
    expect(screen.getByText('Sales')).toBeInTheDocument()
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  it('renders line chart', () => {
    const config = JSON.stringify({
      type: 'line',
      data: [{ name: 'Jan', value: 100 }],
    })

    render(<ChartBlock data={config} />)
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
  })

  it('renders area chart', () => {
    const config = JSON.stringify({
      type: 'area',
      data: [{ name: 'Jan', value: 100 }],
    })

    render(<ChartBlock data={config} />)
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
  })

  it('renders pie chart', () => {
    const config = JSON.stringify({
      type: 'pie',
      data: [
        { name: 'A', value: 30 },
        { name: 'B', value: 70 },
      ],
    })

    render(<ChartBlock data={config} />)
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
  })

  it('shows title when provided', () => {
    const config = JSON.stringify({
      type: 'bar',
      title: 'Monthly Revenue',
      data: [{ name: 'Jan', value: 100 }],
    })

    render(<ChartBlock data={config} />)
    expect(screen.getByText('Monthly Revenue')).toBeInTheDocument()
  })

  it('renders error fallback for invalid JSON', () => {
    render(<ChartBlock data="not json" />)
    expect(screen.getByText(/not json/)).toBeInTheDocument()
  })
})
