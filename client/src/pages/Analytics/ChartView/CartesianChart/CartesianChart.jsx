import { useEffect, useId, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  BarStack,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import ChartLegend from '../ChartLegend/ChartLegend.jsx'
import ChartTooltip from '../ChartTooltip/ChartTooltip.jsx'
import { CATEGORY_KEY, CHART_ANIMATION_MS, SURFACE_COLOR, truncateLabel, truncateNarrowLabel } from '../chart-data.js'
import './CartesianChart.css'

const GRID_COLOR = 'var(--chart-grid)'
const AXIS_COLOR = 'var(--chart-axis)'
const CHART_MARGIN = { top: 8, right: 16, bottom: 0, left: 0 }
const NARROW_WIDTH = 300
const AXIS_BAND_HEIGHT = 38
const MIN_ROW_PITCH = 14
const EVERY_TICK = 0
const TICK_MARGIN = 8
const MIN_TICK_GAP = 16
const ROW_TICK_GAP = 0
const TICK_INTERVAL = 'equidistantPreserveStart'
const VALUE_TICK_INTERVAL = 'preserveStartEnd'
const AUTO_SIZE = 'auto'
const AXIS_LINE = { stroke: AXIS_COLOR }
const MAX_BAR_SIZE = 24
const BAR_GAP = 2
const BAR_CATEGORY_GAP = '28%'
const BAR_END_RADIUS = 4
const COLUMN_RADIUS = [BAR_END_RADIUS, BAR_END_RADIUS, 0, 0]
const ROW_RADIUS = [0, BAR_END_RADIUS, BAR_END_RADIUS, 0]
const STACK_OFFSET = 'sign'
const STACK_GAP = 2
const BASELINE_TOLERANCE = 1
const LINE_WIDTH = 2
const AREA_OPACITY = 0.1
const DOT_RADIUS = 4
const DOT_RING_WIDTH = 2
const ACTIVE_DOT = { r: DOT_RADIUS, stroke: SURFACE_COLOR, strokeWidth: DOT_RING_WIDTH }
const BAND_CURSOR = { fill: GRID_COLOR, fillOpacity: 0.5 }
const LINE_CURSOR = { stroke: AXIS_COLOR, strokeWidth: 1 }
const FONTS_LOADED_EVENT = 'loadingdone'

const CHART_KINDS = {
  bar: {
    Chart: BarChart,
    layout: 'horizontal',
    renderAxes: renderColumnAxes,
    renderMarks: renderBars,
    cursor: BAND_CURSOR,
    legendMark: 'rect',
  },
  row: {
    Chart: BarChart,
    layout: 'vertical',
    renderAxes: renderRowAxes,
    renderMarks: renderBars,
    cursor: BAND_CURSOR,
    legendMark: 'rect',
  },
  line: {
    Chart: LineChart,
    layout: 'horizontal',
    renderAxes: renderColumnAxes,
    renderMarks: renderTrends,
    cursor: LINE_CURSOR,
    legendMark: 'line',
  },
  area: {
    Chart: AreaChart,
    layout: 'horizontal',
    renderAxes: renderColumnAxes,
    renderMarks: renderTrends,
    cursor: LINE_CURSOR,
    legendMark: 'rect',
  },
}

function insetSpan(start, length, baseline) {
  const low = Math.min(start, start + length)
  const high = Math.max(start, start + length)
  const isAnchored = Math.abs(low - baseline) < BASELINE_TOLERANCE || Math.abs(high - baseline) < BASELINE_TOLERANCE

  if (isAnchored) return { start: low, length: high - low }

  return { start: low > baseline ? low + STACK_GAP : low, length: Math.max(high - low - STACK_GAP, 0) }
}

function renderColumnSegment({ x, y, width, height, fill, stackedBarStart }) {
  const span = insetSpan(y, height, stackedBarStart)

  return <rect x={x} y={span.start} width={width} height={span.length} fill={fill} />
}

function renderRowSegment({ x, y, width, height, fill, stackedBarStart }) {
  const span = insetSpan(x, width, stackedBarStart)

  return <rect x={span.start} y={y} width={span.length} height={height} fill={fill} />
}

function renderColumnAxes(model, { fontsVersion }) {
  return [
    <CartesianGrid key="grid" vertical={false} stroke={GRID_COLOR} />,
    <XAxis
      key="category"
      dataKey={CATEGORY_KEY}
      type="category"
      axisLine={AXIS_LINE}
      tickLine={false}
      tickMargin={TICK_MARGIN}
      minTickGap={MIN_TICK_GAP}
      interval={TICK_INTERVAL}
      tickFormatter={truncateLabel}
    />,
    <YAxis
      key={`value-${fontsVersion}`}
      type="number"
      width={AUTO_SIZE}
      axisLine={false}
      tickLine={false}
      tickMargin={TICK_MARGIN}
      allowDecimals={model.hasDecimals}
      tickFormatter={model.formatTick}
    />,
  ]
}

function renderRowAxes(model, { fontsVersion, formatCategory, rowCapacity }) {
  return [
    <CartesianGrid key="grid" horizontal={false} stroke={GRID_COLOR} />,
    <XAxis
      key="value"
      type="number"
      axisLine={false}
      tickLine={false}
      tickMargin={TICK_MARGIN}
      minTickGap={MIN_TICK_GAP}
      interval={VALUE_TICK_INTERVAL}
      allowDecimals={model.hasDecimals}
      tickFormatter={model.formatTick}
    />,
    <YAxis
      key={`category-${fontsVersion}`}
      dataKey={CATEGORY_KEY}
      type="category"
      width={AUTO_SIZE}
      axisLine={AXIS_LINE}
      tickLine={false}
      tickMargin={TICK_MARGIN}
      minTickGap={ROW_TICK_GAP}
      interval={model.data.length <= rowCapacity ? EVERY_TICK : TICK_INTERVAL}
      tickFormatter={formatCategory}
    />,
  ]
}

function renderBars(model, { isAnimated, stackId }) {
  const isRow = model.type === 'row'
  const radius = isRow ? ROW_RADIUS : COLUMN_RADIUS
  const segmentShape = isRow ? renderRowSegment : renderColumnSegment
  const bars = model.series.map(item => (
    <Bar
      key={item.key}
      dataKey={item.key}
      name={item.label}
      fill={item.color}
      maxBarSize={MAX_BAR_SIZE}
      radius={model.isStacked ? undefined : radius}
      stackId={model.isStacked ? stackId : undefined}
      shape={model.isStacked ? segmentShape : undefined}
      isAnimationActive={isAnimated}
      animationDuration={CHART_ANIMATION_MS}
    />
  ))

  if (!model.isStacked) return bars

  return (
    <BarStack stackId={stackId} radius={radius}>
      {bars}
    </BarStack>
  )
}

function renderTrends(model, { isAnimated, stackId }) {
  const isArea = model.type === 'area'
  const Mark = isArea ? Area : Line
  const hasSinglePoint = model.data.length === 1

  return model.series.map(item => {
    const pointDot = {
      r: DOT_RADIUS,
      fill: item.color,
      fillOpacity: 1,
      stroke: SURFACE_COLOR,
      strokeWidth: DOT_RING_WIDTH,
    }

    return (
      <Mark
        key={item.key}
        dataKey={item.key}
        name={item.label}
        stroke={item.color}
        strokeWidth={LINE_WIDTH}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill={isArea ? item.color : undefined}
        fillOpacity={isArea ? AREA_OPACITY : undefined}
        stackId={model.isStacked ? stackId : undefined}
        dot={hasSinglePoint ? pointDot : false}
        activeDot={ACTIVE_DOT}
        isAnimationActive={isAnimated}
        animationDuration={CHART_ANIMATION_MS}
      />
    )
  })
}

export default function CartesianChart({ model, isAnimated }) {
  const stackId = useId()
  const [fontsVersion, setFontsVersion] = useState(0)
  const [isNarrow, setIsNarrow] = useState(false)
  const [rowCapacity, setRowCapacity] = useState(0)
  const kind = CHART_KINDS[model.type]
  const hasLegend = model.series.length > 1
  const formatCategory = isNarrow ? truncateNarrowLabel : truncateLabel

  useEffect(() => {
    const fonts = document.fonts

    if (!fonts) return undefined

    function handleFontsLoaded() {
      setFontsVersion(version => version + 1)
    }

    fonts.addEventListener(FONTS_LOADED_EVENT, handleFontsLoaded)

    return () => {
      fonts.removeEventListener(FONTS_LOADED_EVENT, handleFontsLoaded)
    }
  }, [])

  function handleResize(width, height) {
    setIsNarrow(width < NARROW_WIDTH)
    setRowCapacity(Math.floor((height - AXIS_BAND_HEIGHT) / MIN_ROW_PITCH))
  }

  return (
    <div className="cartesian-chart">
      <div className="cartesian-chart__plot">
        <ResponsiveContainer width="100%" height="100%" onResize={handleResize}>
          <kind.Chart
            data={model.data}
            layout={kind.layout}
            margin={CHART_MARGIN}
            barGap={BAR_GAP}
            barCategoryGap={BAR_CATEGORY_GAP}
            stackOffset={STACK_OFFSET}
            role="img"
            aria-label={model.summary}
          >
            {kind.renderAxes(model, { fontsVersion, formatCategory, rowCapacity })}
            <Tooltip content={<ChartTooltip series={model.series} />} cursor={kind.cursor} isAnimationActive={false} />
            {kind.renderMarks(model, { isAnimated, stackId })}
          </kind.Chart>
        </ResponsiveContainer>
      </div>
      {hasLegend && <ChartLegend items={model.series} mark={kind.legendMark} />}
    </div>
  )
}
