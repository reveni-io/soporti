const CONFIGURED_LABEL = 'configured'
const UNCONFIGURED_LABEL = 'not configured'

export default function StatusRow({
  configured,
  configuredLabel = CONFIGURED_LABEL,
  unconfiguredLabel = UNCONFIGURED_LABEL,
}) {
  return (
    <p className="admin__muted">
      Status:{' '}
      {configured ? (
        <span className="badge badge--success">{configuredLabel}</span>
      ) : (
        <span className="badge">{unconfiguredLabel}</span>
      )}
    </p>
  )
}
