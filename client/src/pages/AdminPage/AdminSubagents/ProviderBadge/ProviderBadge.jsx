import MarkIcon from '../MarkIcon/MarkIcon.jsx'
import './ProviderBadge.css'

const MARK_SIZE = 14

export default function ProviderBadge({ provider, model, globalProvider, globalModel }) {
  const inherits = !provider
  const resolvedProvider = provider ?? globalProvider
  const resolvedModel = provider ? model : globalModel

  return (
    <span className="provider-badge">
      <MarkIcon id={resolvedProvider} label={resolvedProvider} size={MARK_SIZE} />
      {inherits && <span className="provider-badge__inherits">follows global</span>}
      <span className="chip provider-badge__model" title={resolvedModel}>
        {resolvedModel}
      </span>
    </span>
  )
}
