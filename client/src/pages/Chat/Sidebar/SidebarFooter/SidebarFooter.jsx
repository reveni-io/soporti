import Icon from '../../../../common/Icon/Icon.jsx'
import './SidebarFooter.css'

const FOOTER_ICON_SIZE = 16
const SETTINGS_LABEL = 'Settings'
const LOGOUT_LABEL = 'Log out'

export default function SidebarFooter({ user, onOpenSettings, onLogout }) {
  return (
    <div className="sidebar-footer">
      <Account user={user} />
      <button
        type="button"
        className="icon-btn icon-btn--inverse sidebar-footer__settings"
        onClick={onOpenSettings}
        aria-label={SETTINGS_LABEL}
        title={SETTINGS_LABEL}
      >
        <Icon name="settings" size={FOOTER_ICON_SIZE} className="sidebar-footer__icon" />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--inverse sidebar-footer__logout"
        onClick={onLogout}
        aria-label={LOGOUT_LABEL}
        title={LOGOUT_LABEL}
      >
        <Icon name="log-out" size={FOOTER_ICON_SIZE} className="sidebar-footer__icon" />
      </button>
    </div>
  )
}

function Account({ user }) {
  const displayName = user?.name || user?.email

  if (!displayName) return null

  return (
    <div className="sidebar-footer__account">
      <span className="sidebar-footer__avatar" aria-hidden="true">
        {displayName.charAt(0).toUpperCase()}
      </span>
      <span className="sidebar-footer__identity">
        <span className="sidebar-footer__name">{displayName}</span>
        {user.name && user.email && <span className="sidebar-footer__email">{user.email}</span>}
      </span>
    </div>
  )
}
