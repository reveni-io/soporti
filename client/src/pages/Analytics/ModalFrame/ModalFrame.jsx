import { useId } from 'react'
import Icon from '../../../common/Icon/Icon.jsx'
import { useEscapeKey } from '../../../hooks/useEscapeKey/useEscapeKey.js'
import { useOverlayDismiss } from '../../../hooks/useOverlayDismiss/useOverlayDismiss.js'
import './ModalFrame.css'

export default function ModalFrame({ title, className, onClose, children }) {
  const overlayProps = useOverlayDismiss(onClose)
  const titleId = useId()
  useEscapeKey(onClose)

  return (
    <div className="modal-overlay" {...overlayProps}>
      <div className={`modal modal-frame ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal__header modal-frame__header">
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          <button type="button" className="modal__close modal-frame__close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}
