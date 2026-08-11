import './AttachmentChip.css'

export default function AttachmentChip({ attachment, onRemove }) {
  return (
    <li className="chip chip--pill attachment-chip">
      <span className="attachment-chip__name">&#128206; {attachment.name}</span>
      {attachment.truncated && <span className="attachment-chip__note">truncated</span>}
      {onRemove && (
        <button
          type="button"
          className="attachment-chip__remove"
          onClick={onRemove}
          title={`Remove ${attachment.name}`}
        >
          &times;
        </button>
      )}
    </li>
  )
}
