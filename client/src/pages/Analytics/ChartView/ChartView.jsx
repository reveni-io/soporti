import { useMemo } from 'react'
import DataTable from '../DataTable/DataTable.jsx'
import CartesianChart from './CartesianChart/CartesianChart.jsx'
import NumberTile from './NumberTile/NumberTile.jsx'
import PieView from './PieView/PieView.jsx'
import { CHART_VIEW, shapeChart } from './chart-data.js'
import './ChartView.css'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function prefersReducedMotion() {
  if (typeof window.matchMedia !== 'function') return false

  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function normalizeText(text) {
  return String(text).trim().toLowerCase()
}

function labelBesideTitle(label, title) {
  return normalizeText(label) === normalizeText(title) ? '' : label
}

export default function ChartView({ chart, columns, rows, title = '' }) {
  const model = useMemo(() => shapeChart(chart, columns, rows), [chart, columns, rows])
  const isAnimated = !prefersReducedMotion()

  return (
    <div className="chart-view">
      <ChartBody model={model} columns={columns} rows={rows} title={title} isAnimated={isAnimated} />
    </div>
  )
}

function ChartBody({ model, columns, rows, title, isAnimated }) {
  if (model.view === CHART_VIEW.STATE) return <p className="chart-view__state">{model.message}</p>
  if (model.view === CHART_VIEW.TABLE) return <DataTable columns={columns} rows={rows} />
  if (model.view === CHART_VIEW.NUMBER) {
    return <NumberTile label={labelBesideTitle(model.label, title)} value={model.value} />
  }
  if (model.view === CHART_VIEW.PIE) return <PieView model={model} isAnimated={isAnimated} />

  return <CartesianChart model={model} isAnimated={isAnimated} />
}
