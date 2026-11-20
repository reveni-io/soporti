import Icon from '../Icon/Icon.jsx'
import { useAppUpdate } from '../../hooks/useAppUpdate/useAppUpdate.js'
import './UpdateToast.css'

export default function UpdateToast() {
  const { isUpdateAvailable, reload, dismiss } = useAppUpdate()

  if (!isUpdateAvailable) return null

  return (
    <div className="update-toast card card--floating" role="status">
      <Icon name="refresh" className="update-toast__icon" />
      <p className="update-toast__message">A new version of Soporti is ready.</p>
      <button type="button" className="btn btn--primary btn--sm" onClick={reload}>
        Reload
      </button>
      <button type="button" className="icon-btn update-toast__dismiss" aria-label="Dismiss" onClick={dismiss}>
        <Icon name="close" />
      </button>
    </div>
  )
}
