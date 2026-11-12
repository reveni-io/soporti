import { formatCompactNumber, formatNumber } from '../chart-data.js'
import './NumberTile.css'

const MIN_FIT_LENGTH = 3

export default function NumberTile({ label, value }) {
  const isNumber = typeof value === 'number'
  const text = isNumber ? formatCompactNumber(value) : value
  const exact = isNumber ? formatNumber(value) : value
  const fitLength = Math.max(text.length, MIN_FIT_LENGTH)

  return (
    <div className="number-tile">
      {label && <p className="number-tile__label">{label}</p>}
      <p className="number-tile__value" title={exact} style={{ '--number-tile-length': fitLength }}>
        {text}
      </p>
    </div>
  )
}
