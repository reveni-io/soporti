import {
  MAX_SERIES,
  changeGroupKey,
  changeStacked,
  changeType,
  changeValue,
  changeXKey,
  groupColumns,
  hasAxis,
  hasSeries,
  hasValues,
  isStackable,
  toggleSeries,
  valueColumns,
} from '../chart-draft.js'
import ChartTypePicker from './ChartTypePicker/ChartTypePicker.jsx'
import './ChartSettings.css'

const NO_CHART_HINT = 'Run the query to choose how to draw it.'
const NO_MEASURES_HINT = 'The result has no number column to plot.'
const CATEGORY_LABELS = { row: 'Category', pie: 'Category' }
const DEFAULT_CATEGORY_LABEL = 'X axis'

function columnNames(columns) {
  return columns.map(column => column.name)
}

export default function ChartSettings({ chart, columns, onChange }) {
  if (!chart) return <p className="chart-settings__hint">{NO_CHART_HINT}</p>

  const { type } = chart

  function handleTypeChange(nextType) {
    onChange(changeType(chart, nextType, columns))
  }

  function handleXKeyChange(xKey) {
    onChange(changeXKey(chart, xKey, columns))
  }

  function handleGroupKeyChange(groupKey) {
    onChange(changeGroupKey(chart, groupKey))
  }

  function handleValueChange(key) {
    onChange(changeValue(chart, key))
  }

  function handleSeriesToggle(key) {
    onChange(toggleSeries(chart, key))
  }

  function handleStackedChange(event) {
    onChange(changeStacked(chart, event.target.checked))
  }

  return (
    <fieldset className="chart-settings">
      <legend className="chart-settings__legend">Chart</legend>
      <ChartTypePicker value={type} onChange={handleTypeChange} />

      {hasValues(type) && columns.length > 0 && (
        <div className="chart-settings__fields">
          {hasAxis(type) && (
            <SelectField
              label={CATEGORY_LABELS[type] ?? DEFAULT_CATEGORY_LABEL}
              value={chart.xKey}
              options={columnNames(columns)}
              onChange={handleXKeyChange}
            />
          )}
          {hasSeries(type) && (
            <SelectField
              label="Group by"
              value={chart.groupKey}
              options={columnNames(groupColumns(chart, columns))}
              noneLabel="None"
              onChange={handleGroupKeyChange}
            />
          )}
          <ValueField
            chart={chart}
            options={columnNames(valueColumns(chart, columns))}
            onPick={handleValueChange}
            onToggle={handleSeriesToggle}
          />
          {isStackable(type) && (
            <label className="chart-settings__check chart-settings__check--row">
              <input type="checkbox" checked={chart.stacked} onChange={handleStackedChange} />
              Stacked
            </label>
          )}
        </div>
      )}
    </fieldset>
  )
}

function ValueField({ chart, options, onPick, onToggle }) {
  if (options.length === 0) return <p className="chart-settings__hint">{NO_MEASURES_HINT}</p>

  if (hasSeries(chart.type) && !chart.groupKey) {
    return <ValueChecks series={chart.series} options={options} onToggle={onToggle} />
  }

  return <SelectField label="Value" value={chart.series[0]?.key} options={options} onChange={onPick} />
}

function SelectField({ label, value, options, noneLabel, onChange }) {
  return (
    <label className="chart-settings__field">
      <span className="chart-settings__label">{label}</span>
      <select className="input" value={value ?? ''} onChange={event => onChange(event.target.value)}>
        {noneLabel && <option value="">{noneLabel}</option>}
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function ValueChecks({ series, options, onToggle }) {
  const selected = series.map(entry => entry.key)
  const isFull = selected.length >= MAX_SERIES

  function isLocked(option) {
    const isSelected = selected.includes(option)

    return isSelected ? selected.length === 1 : isFull
  }

  return (
    <fieldset className="chart-settings__values">
      <legend className="chart-settings__label">Values</legend>
      <div className="chart-settings__checks">
        {options.map(option => (
          <label key={option} className="chart-settings__check">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              disabled={isLocked(option)}
              onChange={() => onToggle(option)}
            />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
