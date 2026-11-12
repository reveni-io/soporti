import { formatNumber, formatShare } from '../chart-data.js'
import './ChartLegend.css'

export default function ChartLegend({ items, mark = 'rect', layout = 'wrap' }) {
  return (
    <ul className={`chart-legend chart-legend--${layout}`} aria-label="Legend">
      {items.map(item => (
        <li key={item.key} className="chart-legend__item" title={item.label}>
          <span
            className={`chart-legend__swatch chart-legend__swatch--${mark}`}
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          />
          <span className="chart-legend__label">{item.label}</span>
          <LegendFigures value={item.value} share={item.share} />
        </li>
      ))}
    </ul>
  )
}

function LegendFigures({ value, share }) {
  if (value === undefined) return null

  return (
    <>
      <span className="chart-legend__value">{formatNumber(value)}</span>
      <span className="chart-legend__share">{formatShare(share)}</span>
    </>
  )
}
