import Icon from '../../../common/Icon/Icon.jsx'
import './SidebarToggles.css'

const ICON_SIZE = 18
const EXPAND_LABEL = 'Expand sidebar'

export default function SidebarToggles({ isSidebarCollapsed, onOpenSidebar, onExpandSidebar }) {
  return (
    <>
      <button
        type="button"
        className="icon-btn sidebar-toggles__menu"
        onClick={onOpenSidebar}
        aria-label="Open sidebar"
      >
        <Icon name="menu" size={ICON_SIZE} />
      </button>
      {isSidebarCollapsed && (
        <button
          type="button"
          className="icon-btn sidebar-toggles__expand"
          onClick={onExpandSidebar}
          aria-label={EXPAND_LABEL}
          title={EXPAND_LABEL}
        >
          <Icon name="sidebar" size={ICON_SIZE} />
        </button>
      )}
    </>
  )
}
