import Icon from '../../../../../common/Icon/Icon.jsx'
import { CHART_TYPES } from '../../chart-types.js'
import './ChartTypePicker.css'

export default function ChartTypePicker({ value, onChange }) {
  return (
    <div className="chart-type-picker" role="group" aria-label="Chart type">
      {CHART_TYPES.map(option => (
        <button
          key={option.type}
          type="button"
          className="chart-type-picker__option"
          aria-pressed={option.type === value}
          onClick={() => onChange(option.type)}
        >
          <Icon name={option.icon} size={16} />
          {option.label}
        </button>
      ))}
    </div>
  )
}
