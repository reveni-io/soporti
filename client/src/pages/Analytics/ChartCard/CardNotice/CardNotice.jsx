import Icon from '../../../../common/Icon/Icon.jsx'
import './CardNotice.css'

export default function CardNotice({ heading, message, isCode, children }) {
  return (
    <div className="card-notice">
      <Icon name="alert" size={20} className="card-notice__icon" />
      {heading && <p className="card-notice__heading">{heading}</p>}
      <p className={`card-notice__message${isCode ? ' card-notice__message--code' : ''}`}>{message}</p>
      <div className="card-notice__actions">{children}</div>
    </div>
  )
}
