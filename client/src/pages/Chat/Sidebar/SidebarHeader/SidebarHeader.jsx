import Icon from '../../../../common/Icon/Icon.jsx'
import './SidebarHeader.css'

const HEADER_ICON_SIZE = 18
const COLLAPSE_LABEL = 'Collapse sidebar'

export default function SidebarHeader({ onClose, onCollapse }) {
  return (
    <div className="sidebar-header">
      <div className="sidebar-header__brand">
        <span className="sidebar-header__logo" aria-hidden="true">
          <span className="sidebar-header__mark" />
        </span>
        <div className="sidebar-header__text">
          <h1 className="sidebar-header__title">Soporti</h1>
          <p className="sidebar-header__tagline">Your AI teammate for code, data &amp; docs</p>
        </div>
      </div>
      <button
        type="button"
        className="icon-btn icon-btn--inverse sidebar-header__collapse"
        onClick={onCollapse}
        aria-label={COLLAPSE_LABEL}
        title={COLLAPSE_LABEL}
      >
        <Icon name="sidebar" size={HEADER_ICON_SIZE} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--inverse sidebar-header__close"
        onClick={onClose}
        aria-label="Close sidebar"
      >
        <Icon name="close" size={HEADER_ICON_SIZE} className="sidebar-header__close-icon" />
      </button>
    </div>
  )
}
