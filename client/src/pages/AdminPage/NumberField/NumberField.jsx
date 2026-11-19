import { useState } from 'react'
import './NumberField.css'

function toText(value) {
  return value === null || value === undefined ? '' : String(value)
}

function toValue(text) {
  if (text.trim() === '') return null

  const number = Number(text)

  return Number.isNaN(number) ? text : number
}

export default function NumberField({ label, value, onChange, inputMode = 'numeric' }) {
  const [text, setText] = useState(toText(value))

  function handleChange(event) {
    setText(event.target.value)
    onChange(toValue(event.target.value))
  }

  return (
    <label className="number-field">
      {label}
      <input className="input" inputMode={inputMode} value={text} onChange={handleChange} />
    </label>
  )
}
