import { memo, useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

const DEFAULT_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
]
const CHART_HEIGHT = 300
const GRID_COLOR = 'var(--chart-grid)'
const AXIS_TICK = { fill: 'var(--text-secondary)', fontSize: 12 }
const AXIS_LINE = { stroke: 'var(--chart-axis)' }

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border-default)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--text-primary)',
  boxShadow: 'var(--shadow-card-hover)',
}

function CartesianChart({ ChartComponent, ItemComponent, config, animate, width }) {
  const { data, xKey = 'name', series = [{ key: 'value' }] } = config

  const children = [
    <CartesianGrid key="grid" strokeDasharray="3 3" stroke={GRID_COLOR} />,
    <XAxis key="x" dataKey={xKey} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />,
    <YAxis key="y" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />,
    <Tooltip key="tooltip" contentStyle={TOOLTIP_STYLE} />,
    series.length > 1 && <Legend key="legend" />,
    ...series.map((s, i) => (
      <ItemComponent
        key={s.key}
        dataKey={s.key}
        name={s.label || s.key}
        isAnimationActive={animate}
        fill={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
        stroke={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
        {...(ItemComponent === Area ? { fillOpacity: 0.3 } : {})}
        {...(ItemComponent === Bar ? { radius: [3, 3, 0, 0] } : {})}
        {...(ItemComponent === Line ? { strokeWidth: 2 } : {})}
      />
    )),
  ]

  if (width) {
    return (
      <ChartComponent data={data} width={width} height={CHART_HEIGHT}>
        {children}
      </ChartComponent>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <ChartComponent data={data}>{children}</ChartComponent>
    </ResponsiveContainer>
  )
}

function PieChartBlock({ config, animate, width }) {
  const { data } = config

  const children = [
    <Pie
      key="pie"
      data={data}
      dataKey="value"
      nameKey="name"
      isAnimationActive={animate}
      cx="50%"
      cy="50%"
      outerRadius={100}
      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
    >
      {data.map((_, i) => (
        <Cell key={i} fill={DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />
      ))}
    </Pie>,
    <Tooltip key="tooltip" contentStyle={TOOLTIP_STYLE} />,
    <Legend key="legend" />,
  ]

  if (width) {
    return (
      <PieChart width={width} height={CHART_HEIGHT}>
        {children}
      </PieChart>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <PieChart>{children}</PieChart>
    </ResponsiveContainer>
  )
}

const CHART_MAP = {
  bar: { component: BarChart, item: Bar },
  line: { component: LineChart, item: Line },
  area: { component: AreaChart, item: Area },
}

export default memo(function ChartBlock({ data: raw, animate = true, width = null }) {
  const { config, error } = useMemo(() => {
    try {
      return { config: JSON.parse(raw), error: null }
    } catch (e) {
      return { config: null, error: e.message }
    }
  }, [raw])

  if (error || !config || !config.data) {
    return (
      <pre className="chart-block chart-block--error">
        <code>{raw}</code>
      </pre>
    )
  }

  const chartEntry = CHART_MAP[config.type]

  return (
    <div className="chart-block">
      {config.title && <div className="chart-block__title">{config.title}</div>}
      {config.type === 'pie' ? (
        <PieChartBlock config={config} animate={animate} width={width} />
      ) : chartEntry ? (
        <CartesianChart
          ChartComponent={chartEntry.component}
          ItemComponent={chartEntry.item}
          config={config}
          animate={animate}
          width={width}
        />
      ) : (
        <pre className="chart-block chart-block--error">
          <code>Unsupported chart type: {config.type}</code>
        </pre>
      )}
    </div>
  )
})
