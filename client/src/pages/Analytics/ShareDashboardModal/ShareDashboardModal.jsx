import { useId, useState } from 'react'
import CopyButton from '../../../common/CopyButton/CopyButton.jsx'
import { useSaveField } from '../../../hooks/useSaveField/useSaveField.js'
import { absoluteAppUrl } from '../../../services/services.js'
import ModalFrame from '../ModalFrame/ModalFrame.jsx'
import { dashboardPath } from '../dashboard-path.js'
import './ShareDashboardModal.css'

const SWITCH_LABEL = 'Share with the team'
const SWITCH_DESCRIPTION =
  'Everyone signed in to this Soporti can open this dashboard and edit it: add charts, change the SQL, move and delete cards.'
const PRIVATE_NOTE = 'Only you can see this dashboard.'

export default function ShareDashboardModal({ dashboard, onUpdate, onClose }) {
  const [requestedShared, setRequestedShared] = useState(null)
  const { saving, error, save } = useSaveField()

  const isShared = requestedShared ?? dashboard.shared

  async function handleToggle(event) {
    const nextShared = event.target.checked

    setRequestedShared(nextShared)
    await save(() => onUpdate(dashboard.id, { shared: nextShared }))
    setRequestedShared(null)
  }

  return (
    <ModalFrame title="Share dashboard" className="share-dashboard-modal" onClose={onClose}>
      {dashboard.isOwner && <ShareSwitch checked={isShared} disabled={saving} onChange={handleToggle} />}
      {!dashboard.isOwner && (
        <p className="share-dashboard-modal__text">
          Shared with the team by {dashboard.ownerName}. Everyone signed in can edit it.
        </p>
      )}

      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}

      {isShared && <ShareLink url={absoluteAppUrl(dashboardPath(dashboard.id))} />}
      {!isShared && <p className="share-dashboard-modal__note">{PRIVATE_NOTE}</p>}

      <div className="modal__actions">
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Done
        </button>
      </div>
    </ModalFrame>
  )
}

function ShareSwitch({ checked, disabled, onChange }) {
  const labelId = useId()
  const descriptionId = useId()

  return (
    <label className="share-dashboard-modal__switch-row">
      <span className="share-dashboard-modal__switch-copy">
        <span id={labelId} className="share-dashboard-modal__label">
          {SWITCH_LABEL}
        </span>
        <span id={descriptionId} className="share-dashboard-modal__description">
          {SWITCH_DESCRIPTION}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="share-dashboard-modal__switch"
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
    </label>
  )
}

function ShareLink({ url }) {
  const inputId = useId()

  return (
    <div className="share-dashboard-modal__link">
      <label className="share-dashboard-modal__label" htmlFor={inputId}>
        Link
      </label>
      <div className="share-dashboard-modal__link-row">
        <input
          id={inputId}
          className="input share-dashboard-modal__url"
          value={url}
          readOnly
          onFocus={event => event.target.select()}
        />
        <CopyButton text={url} ariaLabel="Copy link" />
      </div>
    </div>
  )
}
