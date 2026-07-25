export default function SidebarFooter({ onOpenSettings, onLogout }) {
  return (
    <div className="sidebar__footer">
      <button className="sidebar__settings" onClick={onOpenSettings}>
        Settings
      </button>
      <button className="sidebar__logout" onClick={onLogout}>
        Log out
      </button>
    </div>
  )
}
