import { Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import ChartLegend from '../ChartLegend/ChartLegend.jsx'
import ChartTooltip from '../ChartTooltip/ChartTooltip.jsx'
import { CHART_ANIMATION_MS, SURFACE_COLOR } from '../chart-data.js'
import './PieView.css'

const PIE_MARGIN = { top: 4, right: 4, bottom: 4, left: 4 }
const INNER_RADIUS = '64%'
const OUTER_RADIUS = '100%'
const START_ANGLE = 90
const END_ANGLE = -270
const SLICE_GAP = 2
const VALUE_KEY = 'value'
const NAME_KEY = 'label'

export default function PieView({ model, isAnimated }) {
  return (
    <div className="pie-view">
      <div className="pie-view__plot">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={PIE_MARGIN} role="img" aria-label={model.summary}>
            <Pie
              data={model.slices}
              dataKey={VALUE_KEY}
              nameKey={NAME_KEY}
              innerRadius={INNER_RADIUS}
              outerRadius={OUTER_RADIUS}
              startAngle={START_ANGLE}
              endAngle={END_ANGLE}
              stroke={SURFACE_COLOR}
              strokeWidth={SLICE_GAP}
              isAnimationActive={isAnimated}
              animationBegin={0}
              animationDuration={CHART_ANIMATION_MS}
            />
            <Tooltip content={<ChartTooltip series={model.series} />} isAnimationActive={false} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="pie-view__legend">
        <ChartLegend items={model.slices} layout="list" />
      </div>
    </div>
  )
}
