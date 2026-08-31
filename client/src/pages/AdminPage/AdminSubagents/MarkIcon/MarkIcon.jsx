import IntegrationIcon from '../../../../common/IntegrationIcon/IntegrationIcon.jsx'
import { hasIntegrationIcon } from '../../../../common/IntegrationIcon/icon-paths.js'
import './MarkIcon.css'

const DEFAULT_SIZE = 18
const FALLBACK_INITIAL = '?'

function initialOf(label) {
  const trimmed = typeof label === 'string' ? label.trim() : ''

  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : FALLBACK_INITIAL
}

export default function MarkIcon({ id, label, size = DEFAULT_SIZE }) {
  if (hasIntegrationIcon(id)) return <IntegrationIcon id={id} size={size} />

  return (
    <span className="mark-icon" style={{ width: size, height: size }} aria-hidden="true">
      {initialOf(label ?? id)}
    </span>
  )
}
