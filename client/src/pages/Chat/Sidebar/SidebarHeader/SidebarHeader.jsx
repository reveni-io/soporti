export default function SidebarHeader({ onClose }) {
  return (
    <div className="sidebar__header">
      <div className="sidebar__header-row">
        <h1 className="sidebar__title">Soporti</h1>
        <button className="sidebar__close" onClick={onClose} aria-label="Close sidebar">
          &times;
        </button>
      </div>
      <p className="sidebar__subtitle">Your AI teammate for code, data &amp; docs</p>
    </div>
  )
}
