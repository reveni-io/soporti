import { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import CartesianChart from './CartesianChart.jsx'
import { shapeChart } from '../chart-data.js'

const harness = vi.hoisted(() => ({ resize: null, valueAxisMounts: 0 }))

vi.mock('recharts', () => {
  const LONG_LABEL = 'Wireless noise-cancelling headphones'
  const TOOLTIP_DATUM = { x: 'Mar 3', label: 'Mar 3, 2026', s0: 42, s1: 7 }
  const FLOATING_SEGMENT = { x: 140, y: 20, width: 30, height: 30, fill: 'var(--chart-2)', stackedBarStart: 100 }
  const ANCHORED_SEGMENT = { x: 100, y: 70, width: 30, height: 30, fill: 'var(--chart-1)', stackedBarStart: 100 }

  function chartOf(testId) {
    return ({ children, layout, role, barGap, stackOffset, 'aria-label': ariaLabel }) => (
      <div
        data-testid={testId}
        role={role}
        aria-label={ariaLabel}
        data-layout={layout}
        data-bar-gap={barGap}
        data-stack-offset={stackOffset}
      >
        {children}
      </div>
    )
  }

  function axisOf(testId) {
    return ({ type, dataKey, width, interval, axisLine, tickLine, allowDecimals, tickFormatter }) => {
      useEffect(() => {
        if (testId === 'y-axis') harness.valueAxisMounts += 1
      }, [])

      return (
        <div
          data-testid={testId}
          data-type={type}
          data-key={dataKey}
          data-width={width}
          data-interval={String(interval)}
          data-axis-line={JSON.stringify(axisLine)}
          data-tick-line={String(tickLine)}
          data-decimals={String(allowDecimals)}
          data-number-tick={tickFormatter(12500)}
          data-text-tick={tickFormatter(LONG_LABEL)}
        />
      )
    }
  }

  function trendOf(testId) {
    return props => (
      <div
        data-testid={testId}
        data-key={props.dataKey}
        data-name={props.name}
        data-stroke={props.stroke}
        data-stroke-width={props.strokeWidth}
        data-linejoin={props.strokeLinejoin}
        data-linecap={props.strokeLinecap}
        data-fill={String(props.fill)}
        data-fill-opacity={String(props.fillOpacity)}
        data-stack={String(props.stackId)}
        data-dot={JSON.stringify(props.dot)}
        data-active-dot={JSON.stringify(props.activeDot)}
        data-animated={String(props.isAnimationActive)}
        data-duration={props.animationDuration}
      />
    )
  }

  return {
    ResponsiveContainer: ({ children, onResize }) => {
      harness.resize = onResize

      return <div data-testid="responsive-container">{children}</div>
    },
    BarChart: chartOf('bar-chart'),
    LineChart: chartOf('line-chart'),
    AreaChart: chartOf('area-chart'),
    CartesianGrid: ({ vertical, horizontal, stroke, strokeDasharray }) => (
      <div
        data-testid="grid"
        data-vertical={String(vertical)}
        data-horizontal={String(horizontal)}
        data-stroke={stroke}
        data-dash={String(strokeDasharray)}
      />
    ),
    XAxis: axisOf('x-axis'),
    YAxis: axisOf('y-axis'),
    Tooltip: ({ content, cursor, isAnimationActive }) => (
      <div data-testid="tooltip" data-cursor={JSON.stringify(cursor)} data-animated={String(isAnimationActive)}>
        <content.type series={content.props.series} active payload={[{ payload: TOOLTIP_DATUM }]} />
      </div>
    ),
    BarStack: ({ children, stackId, radius }) => (
      <div data-testid="bar-stack" data-stack={stackId} data-radius={JSON.stringify(radius)}>
        {children}
      </div>
    ),
    Bar: props => (
      <div
        data-testid="bar"
        data-key={props.dataKey}
        data-name={props.name}
        data-fill={props.fill}
        data-max-size={props.maxBarSize}
        data-radius={JSON.stringify(props.radius)}
        data-stack={String(props.stackId)}
        data-animated={String(props.isAnimationActive)}
        data-duration={props.animationDuration}
      >
        {props.shape && (
          <svg>
            <g data-testid="floating-segment">{props.shape(FLOATING_SEGMENT)}</g>
            <g data-testid="anchored-segment">{props.shape(ANCHORED_SEGMENT)}</g>
          </svg>
        )}
      </div>
    ),
    Line: trendOf('line'),
    Area: trendOf('area'),
  }
})

const COLUMNS = [
  { name: 'week', kind: 'date' },
  { name: 'returns', kind: 'number' },
  { name: 'refunds', kind: 'number' },
]

const ROWS = [
  { week: '2026-03-03T00:00:00.000Z', returns: 42, refunds: 7 },
  { week: '2026-03-10T00:00:00.000Z', returns: 31, refunds: 9 },
  { week: '2026-03-17T00:00:00.000Z', returns: 55, refunds: 12 },
]

const ONE_SERIES = [{ key: 'returns', label: 'Returns' }]
const TWO_SERIES = [
  { key: 'returns', label: 'Returns' },
  { key: 'refunds', label: 'Refunds' },
]

function modelOf(overrides, rows = ROWS) {
  const chart = { type: 'bar', xKey: 'week', groupKey: null, series: ONE_SERIES, stacked: false, ...overrides }

  return shapeChart(chart, COLUMNS, rows)
}

function rectOf(testId) {
  const rect = screen.getAllByTestId(testId)[0].querySelector('rect')

  return ['x', 'y', 'width', 'height', 'fill'].map(name => rect.getAttribute(name))
}

describe('CartesianChart', () => {
  beforeEach(() => {
    harness.resize = null
    harness.valueAxisMounts = 0
  })

  afterEach(() => {
    delete document.fonts
  })

  it('draws columns on the horizontal layout with value gridlines only', () => {
    render(<CartesianChart model={modelOf({})} isAnimated />)

    expect(screen.getByTestId('bar-chart')).toHaveAttribute('data-layout', 'horizontal')
    expect(screen.getByTestId('grid')).toHaveAttribute('data-vertical', 'false')
    expect(screen.getByTestId('grid')).toHaveAttribute('data-stroke', 'var(--chart-grid)')
    expect(screen.getByTestId('grid')).toHaveAttribute('data-dash', 'undefined')
    expect(screen.getByTestId('x-axis')).toHaveAttribute('data-key', 'x')
    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-type', 'number')
  })

  it('draws a row chart on the vertical layout with the categories on the left', () => {
    render(<CartesianChart model={modelOf({ type: 'row' })} isAnimated />)

    expect(screen.getByTestId('bar-chart')).toHaveAttribute('data-layout', 'vertical')
    expect(screen.getByTestId('grid')).toHaveAttribute('data-horizontal', 'false')
    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-type', 'category')
    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-key', 'x')
    expect(screen.getByTestId('x-axis')).toHaveAttribute('data-type', 'number')
  })

  it('draws the baseline in the axis colour, no tick marks, and a value axis sized to its labels', () => {
    render(<CartesianChart model={modelOf({})} isAnimated />)

    expect(screen.getByTestId('x-axis')).toHaveAttribute('data-axis-line', '{"stroke":"var(--chart-axis)"}')
    expect(screen.getByTestId('x-axis')).toHaveAttribute('data-tick-line', 'false')
    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-axis-line', 'false')
    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-tick-line', 'false')
    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-width', 'auto')
  })

  it('paints a single series in the first slot and shows no legend', () => {
    render(<CartesianChart model={modelOf({})} isAnimated />)

    expect(screen.getAllByTestId('bar')).toHaveLength(1)
    expect(screen.getByTestId('bar')).toHaveAttribute('data-fill', 'var(--chart-1)')
    expect(screen.queryByRole('list', { name: 'Legend' })).not.toBeInTheDocument()
  })

  it('gives the series the chart slots in order and shows a legend from two series up', () => {
    render(<CartesianChart model={modelOf({ series: TWO_SERIES })} isAnimated />)

    const bars = screen.getAllByTestId('bar')
    const legend = screen.getByRole('list', { name: 'Legend' })

    expect(bars.map(bar => bar.getAttribute('data-fill'))).toEqual(['var(--chart-1)', 'var(--chart-2)'])
    expect(bars.map(bar => bar.getAttribute('data-name'))).toEqual(['Returns', 'Refunds'])
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map(item => item.textContent)
    ).toEqual(['Returns', 'Refunds'])
    expect(legend.querySelectorAll('.chart-legend__swatch--rect')).toHaveLength(2)
  })

  it('caps the bar thickness, rounds only the data end and separates grouped bars', () => {
    render(<CartesianChart model={modelOf({ series: TWO_SERIES })} isAnimated />)

    const [bar] = screen.getAllByTestId('bar')

    expect(bar).toHaveAttribute('data-max-size', '24')
    expect(bar).toHaveAttribute('data-radius', '[4,4,0,0]')
    expect(bar).toHaveAttribute('data-stack', 'undefined')
    expect(screen.getByTestId('bar-chart')).toHaveAttribute('data-bar-gap', '2')
    expect(screen.queryByTestId('bar-stack')).not.toBeInTheDocument()
  })

  it('rounds the right end of horizontal bars', () => {
    render(<CartesianChart model={modelOf({ type: 'row' })} isAnimated />)

    expect(screen.getByTestId('bar')).toHaveAttribute('data-radius', '[0,4,4,0]')
  })

  it('stacks the series under one stack id and rounds the stack as a whole', () => {
    render(<CartesianChart model={modelOf({ series: TWO_SERIES, stacked: true })} isAnimated />)

    const stack = screen.getByTestId('bar-stack')
    const stackIds = screen.getAllByTestId('bar').map(bar => bar.getAttribute('data-stack'))

    expect(stackIds[0]).not.toBe('undefined')
    expect(stackIds).toEqual([stackIds[0], stackIds[0]])
    expect(stack).toHaveAttribute('data-stack', stackIds[0])
    expect(stack).toHaveAttribute('data-radius', '[4,4,0,0]')
    expect(screen.getAllByTestId('bar')[0]).not.toHaveAttribute('data-radius')
    expect(screen.getByTestId('bar-chart')).toHaveAttribute('data-stack-offset', 'sign')
  })

  it('gives every chart its own stack id so two dashboard cards never share clip paths', () => {
    render(<CartesianChart model={modelOf({ series: TWO_SERIES, stacked: true })} isAnimated />)
    render(<CartesianChart model={modelOf({ series: TWO_SERIES, stacked: true })} isAnimated />)

    const [first, second] = screen.getAllByTestId('bar-stack')

    expect(first.getAttribute('data-stack')).not.toBe(second.getAttribute('data-stack'))
  })

  it('leaves a two pixel surface gap under a stacked column segment and none at the baseline', () => {
    render(<CartesianChart model={modelOf({ series: TWO_SERIES, stacked: true })} isAnimated />)

    expect(rectOf('floating-segment')).toEqual(['140', '20', '30', '28', 'var(--chart-2)'])
    expect(rectOf('anchored-segment')).toEqual(['100', '70', '30', '30', 'var(--chart-1)'])
  })

  it('leaves the same gap on the baseline side of a stacked row segment', () => {
    render(<CartesianChart model={modelOf({ type: 'row', series: TWO_SERIES, stacked: true })} isAnimated />)

    expect(rectOf('floating-segment')).toEqual(['142', '20', '28', '30', 'var(--chart-2)'])
    expect(rectOf('anchored-segment')).toEqual(['100', '70', '30', '30', 'var(--chart-1)'])
    expect(screen.getByTestId('bar-stack')).toHaveAttribute('data-radius', '[0,4,4,0]')
  })

  it('draws lines two pixels wide with round joins and no dot per point', () => {
    render(<CartesianChart model={modelOf({ type: 'line', series: TWO_SERIES })} isAnimated />)

    const lines = screen.getAllByTestId('line')

    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    expect(lines.map(line => line.getAttribute('data-stroke'))).toEqual(['var(--chart-1)', 'var(--chart-2)'])
    expect(lines[0]).toHaveAttribute('data-stroke-width', '2')
    expect(lines[0]).toHaveAttribute('data-linejoin', 'round')
    expect(lines[0]).toHaveAttribute('data-linecap', 'round')
    expect(lines[0]).toHaveAttribute('data-dot', 'false')
    expect(lines[0]).toHaveAttribute('data-fill', 'undefined')
    expect(lines[0]).toHaveAttribute('data-active-dot', '{"r":4,"stroke":"var(--bg-surface)","strokeWidth":2}')
  })

  it('mirrors the lines in the legend with stroke keys', () => {
    render(<CartesianChart model={modelOf({ type: 'line', series: TWO_SERIES })} isAnimated />)

    expect(screen.getByRole('list', { name: 'Legend' }).querySelectorAll('.chart-legend__swatch--line')).toHaveLength(2)
  })

  it('marks the only point of a line so it stays visible', () => {
    render(<CartesianChart model={modelOf({ type: 'line' }, ROWS.slice(0, 1))} isAnimated />)

    expect(screen.getByTestId('line')).toHaveAttribute(
      'data-dot',
      '{"r":4,"fill":"var(--chart-1)","fillOpacity":1,"stroke":"var(--bg-surface)","strokeWidth":2}'
    )
  })

  it('washes areas at ten percent under the same line', () => {
    render(<CartesianChart model={modelOf({ type: 'area' })} isAnimated />)

    const area = screen.getByTestId('area')

    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    expect(area).toHaveAttribute('data-fill', 'var(--chart-1)')
    expect(area).toHaveAttribute('data-fill-opacity', '0.1')
    expect(area).toHaveAttribute('data-stroke-width', '2')
    expect(area).toHaveAttribute('data-stack', 'undefined')
  })

  it('stacks areas under one stack id when asked', () => {
    render(<CartesianChart model={modelOf({ type: 'area', series: TWO_SERIES, stacked: true })} isAnimated />)

    const stackIds = screen.getAllByTestId('area').map(area => area.getAttribute('data-stack'))

    expect(stackIds[0]).not.toBe('undefined')
    expect(stackIds[1]).toBe(stackIds[0])
  })

  it('writes value ticks in full on an axis under ten thousand', () => {
    render(<CartesianChart model={modelOf({})} isAnimated />)

    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-number-tick', '12,500')
    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-decimals', 'false')
  })

  it('compacts value ticks on an axis that reaches ten thousand', () => {
    const rows = [{ week: '2026-03-03T00:00:00.000Z', returns: 18000.5, refunds: 0 }]

    render(<CartesianChart model={modelOf({}, rows)} isAnimated />)

    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-number-tick', '12.5K')
    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-decimals', 'true')
  })

  it('truncates long category labels past eighteen characters on both layouts', () => {
    render(<CartesianChart model={modelOf({})} isAnimated />)
    render(<CartesianChart model={modelOf({ type: 'row' })} isAnimated />)

    expect(screen.getAllByTestId('x-axis')[0]).toHaveAttribute('data-text-tick', 'Wireless noise-ca…')
    expect(screen.getAllByTestId('y-axis')[1]).toHaveAttribute('data-text-tick', 'Wireless noise-ca…')
  })

  it('shortens the row labels further once the card gets narrow', () => {
    render(<CartesianChart model={modelOf({ type: 'row' })} isAnimated />)

    act(() => harness.resize(240, 300))

    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-text-tick', 'Wireless…')

    act(() => harness.resize(640, 300))

    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-text-tick', 'Wireless noise-ca…')
  })

  it('labels every row while the rows have room and thins the labels when they do not', () => {
    render(<CartesianChart model={modelOf({ type: 'row' })} isAnimated />)

    act(() => harness.resize(640, 300))

    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-interval', '0')

    act(() => harness.resize(640, 60))

    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-interval', 'equidistantPreserveStart')
  })

  it('thins the category ticks of a column chart automatically', () => {
    render(<CartesianChart model={modelOf({})} isAnimated />)

    expect(screen.getByTestId('x-axis')).toHaveAttribute('data-interval', 'equidistantPreserveStart')
  })

  it('summarises the chart for assistive technology', () => {
    render(<CartesianChart model={modelOf({ series: TWO_SERIES, stacked: true })} isAnimated />)

    expect(
      screen.getByRole('img', { name: 'Stacked bar chart of Returns and Refunds with 3 points' })
    ).toBeInTheDocument()
  })

  it('plays a short entry animation', () => {
    render(<CartesianChart model={modelOf({})} isAnimated />)

    expect(screen.getByTestId('bar')).toHaveAttribute('data-animated', 'true')
    expect(screen.getByTestId('bar')).toHaveAttribute('data-duration', '400')
  })

  it('draws statically when animation is off', () => {
    render(<CartesianChart model={modelOf({})} isAnimated={false} />)
    render(<CartesianChart model={modelOf({ type: 'line' })} isAnimated={false} />)

    expect(screen.getByTestId('bar')).toHaveAttribute('data-animated', 'false')
    expect(screen.getByTestId('line')).toHaveAttribute('data-animated', 'false')
  })

  it('shares one tooltip that lists every series at the hovered x', () => {
    render(<CartesianChart model={modelOf({ series: TWO_SERIES })} isAnimated />)

    const tooltip = screen.getByTestId('tooltip')

    expect(within(tooltip).getByText('Mar 3, 2026')).toBeInTheDocument()
    expect(
      within(tooltip)
        .getAllByRole('listitem')
        .map(row => row.textContent)
    ).toEqual(['Returns42', 'Refunds7'])
  })

  it('highlights the hovered band on bars and tracks lines with a hairline', () => {
    render(<CartesianChart model={modelOf({})} isAnimated />)
    render(<CartesianChart model={modelOf({ type: 'line' })} isAnimated />)

    const [barTooltip, lineTooltip] = screen.getAllByTestId('tooltip')

    expect(barTooltip).toHaveAttribute('data-cursor', '{"fill":"var(--chart-grid)","fillOpacity":0.5}')
    expect(lineTooltip).toHaveAttribute('data-cursor', '{"stroke":"var(--chart-axis)","strokeWidth":1}')
  })

  it('measures the value axis again once web fonts finish loading', () => {
    document.fonts = new EventTarget()

    render(<CartesianChart model={modelOf({})} isAnimated />)

    expect(harness.valueAxisMounts).toBe(1)

    act(() => {
      document.fonts.dispatchEvent(new Event('loadingdone'))
    })

    expect(harness.valueAxisMounts).toBe(2)
  })

  it('stops listening for fonts when the chart goes away', () => {
    document.fonts = new EventTarget()

    const { unmount } = render(<CartesianChart model={modelOf({})} isAnimated />)

    unmount()
    act(() => {
      document.fonts.dispatchEvent(new Event('loadingdone'))
    })

    expect(harness.valueAxisMounts).toBe(1)
  })
})
