import { formatNumber, formatShare } from '../chart-data.js'
import './ChartTooltip.css'

export default function ChartTooltip({ active, payload, series }) {
  if (!active || !payload || payload.length === 0) return null

  const datum = payload[0].payload
  const rows = series.filter(item => typeof datum[item.key] === 'number')

  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__title">{datum.label}</p>
      <ul className="chart-tooltip__rows">
        {rows.map(item => (
          <li key={item.key} className="chart-tooltip__row">
            <span
              className="chart-tooltip__key"
              style={{ backgroundColor: item.color ?? datum.color }}
              aria-hidden="true"
            />
            <span className="chart-tooltip__label">{item.label}</span>
            <span className="chart-tooltip__value">{formatNumber(datum[item.key])}</span>
            <TooltipShare share={datum.share} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function TooltipShare({ share }) {
  if (share === undefined) return null

  return <span className="chart-tooltip__share">{formatShare(share)}</span>
}
