import { useAttachmentImage } from '../../hooks/useAttachmentImage/useAttachmentImage.js'
import { PAPERCLIP_GLYPH } from '../../constants.js'
import './AttachmentChip.css'

const PICTURE = '\u{1F5BC}'

function Thumbnail({ attachment, token }) {
  const { image, expired } = useAttachmentImage(token, attachment.previewUrl ? null : attachment.imageId)
  const source = attachment.previewUrl ?? image

  if (source) return <img className="attachment-chip__thumb" src={source} alt={attachment.name} />

  return (
    <span
      className="attachment-chip__thumb attachment-chip__thumb--placeholder"
      title={expired ? `${attachment.name} is no longer stored` : attachment.name}
    >
      {PICTURE}
    </span>
  )
}

export default function AttachmentChip({ attachment, token, onRemove }) {
  const isImage = Boolean(attachment.imageId)

  return (
    <li className="chip chip--pill attachment-chip">
      {isImage ? (
        <Thumbnail attachment={attachment} token={token} />
      ) : (
        <span className="attachment-chip__glyph">{PAPERCLIP_GLYPH}</span>
      )}
      <span className="attachment-chip__name">{attachment.name}</span>
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
