import './ProgressBar.css'

const MAX_PERCENT = 100

export default function ProgressBar({ value, label }) {
  const percent = Math.min(MAX_PERCENT, Math.max(0, value))

  return (
    <div
      className="progress-bar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={MAX_PERCENT}
      aria-valuenow={percent}
    >
      <div className="progress-bar__fill" style={{ width: `${percent}%` }} />
    </div>
  )
}
