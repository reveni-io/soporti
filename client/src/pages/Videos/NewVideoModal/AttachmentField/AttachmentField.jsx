import AttachmentChip from '../../../../common/AttachmentChip/AttachmentChip.jsx'
import { ATTACHMENT_ACCEPT, VIDEO_MAX_ATTACHMENTS } from '../../../../constants.js'
import './AttachmentField.css'

export default function AttachmentField({ attachments, isUploading, error, token, onAddFiles, onRemove }) {
  const isLocked = isUploading || attachments.length >= VIDEO_MAX_ATTACHMENTS

  function handleFilesSelected(event) {
    onAddFiles(event.target.files)
    event.target.value = ''
  }

  return (
    <div className="attachment-field">
      <div className="attachment-field__header">
        <span className="attachment-field__label">
          Attachments <span className="attachment-field__hint">optional, up to {VIDEO_MAX_ATTACHMENTS}</span>
        </span>

        <label className={`btn btn--secondary btn--sm${isLocked ? ' attachment-field__button--locked' : ''}`}>
          {isUploading ? 'Uploading…' : 'Attach files'}
          <input
            type="file"
            className="attachment-field__input"
            accept={ATTACHMENT_ACCEPT}
            multiple
            disabled={isLocked}
            aria-label="Attach files"
            onChange={handleFilesSelected}
          />
        </label>
      </div>

      {error && <p className="alert alert--error">{error}</p>}

      {attachments.length > 0 && (
        <ul className="attachment-field__list">
          {attachments.map((attachment, index) => (
            <AttachmentChip
              key={`${attachment.name}-${index}`}
              attachment={attachment}
              token={token}
              onRemove={() => onRemove(index)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
