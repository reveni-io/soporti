import { useId } from 'react'
import { HUBSPOT_LEVEL_LABELS } from '../../../constants.js'
import './PermissionField.css'

export default function PermissionField({ area, levels, value, disabled, onChange }) {
  const areaId = useId()

  return (
    <div className="permission-field">
      <span className="permission-field__area" id={areaId}>
        {area}
      </span>

      <div className="permission-field__levels" role="radiogroup" aria-labelledby={areaId}>
        {levels.map(level => (
          <LevelOption
            key={level}
            level={level}
            group={areaId}
            checked={level === value}
            disabled={disabled}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  )
}

function LevelOption({ level, group, checked, disabled, onChange }) {
  const variant = checked ? 'btn--primary' : 'btn--secondary'

  return (
    <label className={`btn btn--sm ${variant} permission-field__level`}>
      <input
        className="permission-field__input"
        type="radio"
        name={group}
        value={level}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(level)}
      />
      {HUBSPOT_LEVEL_LABELS[level]}
    </label>
  )
}
