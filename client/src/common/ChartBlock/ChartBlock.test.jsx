import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ChartBlock from './ChartBlock.jsx'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  AreaChart: ({ children }) => <div data-testid="area-chart">{children}</div>,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Bar: props => <div data-testid="bar" data-animation={String(props.isAnimationActive)} />,
  Line: () => <div data-testid="line" />,
  Area: () => <div data-testid="area" />,
  Pie: props => <div data-testid="pie" data-animation={String(props.isAnimationActive)} />,
  Cell: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
}))

describe('ChartBlock', () => {
  it('animates in the chat by default', () => {
    const config = JSON.stringify({ type: 'bar', data: [{ name: 'Jan', value: 100 }] })

    render(<ChartBlock data={config} />)

    expect(screen.getByTestId('bar')).toHaveAttribute('data-animation', 'true')
  })

  it('draws the data statically when animation is off, so a snapshot is complete', () => {
    const config = JSON.stringify({ type: 'bar', data: [{ name: 'Jan', value: 100 }] })

    render(<ChartBlock data={config} animate={false} />)

    expect(screen.getByTestId('bar')).toHaveAttribute('data-animation', 'false')
  })

  it('keeps the pie static too when animation is off', () => {
    const config = JSON.stringify({ type: 'pie', data: [{ name: 'Jan', value: 100 }] })

    render(<ChartBlock data={config} animate={false} />)

    expect(screen.getByTestId('pie')).toHaveAttribute('data-animation', 'false')
  })

  it('renders at a fixed width without the responsive container when one is given', () => {
    const config = JSON.stringify({ type: 'bar', data: [{ name: 'Jan', value: 100 }] })

    render(<ChartBlock data={config} width={500} />)

    expect(screen.queryByTestId('responsive-container')).not.toBeInTheDocument()
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  it('renders a fixed pie without the responsive container too', () => {
    const config = JSON.stringify({ type: 'pie', data: [{ name: 'Jan', value: 100 }] })

    render(<ChartBlock data={config} width={500} />)

    expect(screen.queryByTestId('responsive-container')).not.toBeInTheDocument()
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
  })

  it('keeps the responsive container for the chat, where no width is known', () => {
    const config = JSON.stringify({ type: 'bar', data: [{ name: 'Jan', value: 100 }] })

    render(<ChartBlock data={config} />)

    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })

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
