import Icon from '../../../../common/Icon/Icon.jsx'

const SHARE_ICON_STROKE = 1.5

export default function ChatTopbar({ canShare, isLoading, onOpenSidebar, onOpenTour, onShare }) {
  return (
    <div className="chat__topbar">
      <button className="chat__menu-btn" onClick={onOpenSidebar} aria-label="Open sidebar">
        &#9776;
      </button>
      <span className="chat__topbar-title">Soporti</span>
      <button className="chat__tour-btn" onClick={onOpenTour}>
        What can I ask?
      </button>
      {canShare && (
        <button
          className="chat__share-btn"
          onClick={onShare}
          disabled={isLoading}
          title="Share conversation"
          aria-label="Share conversation"
        >
          <Icon name="share" strokeWidth={SHARE_ICON_STROKE} />
        </button>
      )}
    </div>
  )
}
