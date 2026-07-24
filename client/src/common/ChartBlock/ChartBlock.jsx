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

const DEFAULT_COLORS = ['#2f9e2c', '#3f7fbf', '#e07020', '#6f4fc0', '#b8952e', '#c85a94']

const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #e4eae3',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#042503',
  boxShadow: '0 4px 16px rgba(4, 37, 3, 0.1)',
}

function CartesianChart({ ChartComponent, ItemComponent, config }) {
  const { data, xKey = 'name', series = [{ key: 'value' }] } = config

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ChartComponent data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(4, 37, 3, 0.08)" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: '#556654', fontSize: 12 }}
          axisLine={{ stroke: 'rgba(4, 37, 3, 0.15)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#556654', fontSize: 12 }}
          axisLine={{ stroke: 'rgba(4, 37, 3, 0.15)' }}
          tickLine={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        {series.length > 1 && <Legend />}
        {series.map((s, i) => (
          <ItemComponent
            key={s.key}
            dataKey={s.key}
            name={s.label || s.key}
            fill={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
            stroke={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
            {...(ItemComponent === Area ? { fillOpacity: 0.3 } : {})}
            {...(ItemComponent === Bar ? { radius: [3, 3, 0, 0] } : {})}
            {...(ItemComponent === Line ? { strokeWidth: 2 } : {})}
          />
        ))}
      </ChartComponent>
    </ResponsiveContainer>
  )
}

function PieChartBlock({ config }) {
  const { data } = config

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={100}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}

const CHART_MAP = {
  bar: { component: BarChart, item: Bar },
  line: { component: LineChart, item: Line },
  area: { component: AreaChart, item: Area },
}

export default memo(function ChartBlock({ data: raw }) {
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
        <PieChartBlock config={config} />
      ) : chartEntry ? (
        <CartesianChart ChartComponent={chartEntry.component} ItemComponent={chartEntry.item} config={config} />
      ) : (
        <pre className="chart-block chart-block--error">
          <code>Unsupported chart type: {config.type}</code>
        </pre>
      )}
    </div>
  )
})
