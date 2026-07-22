import { useRef } from 'react'
import './ShareModal.css'

export default function ShareModal({ url, onClose }) {
  const inputRef = useRef(null)

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      inputRef.current?.select()
    })
  }

  function handleInputClick() {
    inputRef.current?.select()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal share-modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal__title">Share conversation</h3>

        <div className="share-modal__url-row">
          <input
            ref={inputRef}
            className="input share-modal__url-input"
            value={url}
            readOnly
            onClick={handleInputClick}
          />
          <button className="btn btn--primary btn--sm" onClick={handleCopy}>
            Copy
          </button>
        </div>

        <p className="share-modal__notice">This link is temporary and will expire within 24 hours.</p>

        <button className="btn btn--secondary btn--block" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
