import './SegmentedControl.css'

export default function SegmentedControl({ label, name, options, value, hint, onChange }) {
  return (
    <fieldset className="segmented-control">
      <legend className="segmented-control__legend">{label}</legend>

      <div className="segmented-control__options">
        {options.map(option => (
          <label
            key={option.value}
            className={`segmented-control__option${option.value === value ? ' segmented-control__option--selected' : ''}`}
          >
            <input
              type="radio"
              className="segmented-control__input"
              name={name}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>

      {hint && <p className="segmented-control__hint">{hint}</p>}
    </fieldset>
  )
}
