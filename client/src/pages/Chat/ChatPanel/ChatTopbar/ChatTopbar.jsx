import Icon from '../../../../common/Icon/Icon.jsx'
import './ChatTopbar.css'

const NAV_ICON_SIZE = 18
const ACTION_ICON_SIZE = 15
const SHARE_ICON_STROKE = 1.5
const TOUR_LABEL = 'What can I ask?'
const SHARE_LABEL = 'Share conversation'
const EXPAND_LABEL = 'Expand sidebar'

export default function ChatTopbar({
  title,
  canShare,
  isLoading,
  isSidebarCollapsed,
  onOpenSidebar,
  onExpandSidebar,
  onOpenTour,
  onShare,
}) {
  return (
    <header className="chat-topbar">
      <div className="chat-topbar__lead">
        <button type="button" className="icon-btn chat-topbar__menu" onClick={onOpenSidebar} aria-label="Open sidebar">
          <Icon name="menu" size={NAV_ICON_SIZE} />
        </button>
        {isSidebarCollapsed && (
          <button
            type="button"
            className="icon-btn chat-topbar__expand"
            onClick={onExpandSidebar}
            aria-label={EXPAND_LABEL}
            title={EXPAND_LABEL}
          >
            <Icon name="sidebar" size={NAV_ICON_SIZE} />
          </button>
        )}
        <div className="chat-topbar__heading">
          {isLoading && <span className="chat-topbar__live" aria-hidden="true" />}
          <h2 key={title} className="chat-topbar__title" title={title}>
            {title}
          </h2>
        </div>
      </div>

      <div className="chat-topbar__actions">
        <button
          type="button"
          className="chat-topbar__action chat-topbar__tour"
          onClick={onOpenTour}
          aria-label={TOUR_LABEL}
        >
          <Icon name="help-circle" size={ACTION_ICON_SIZE} className="chat-topbar__tour-icon" />
          <span className="chat-topbar__label">{TOUR_LABEL}</span>
        </button>
        {canShare && (
          <button
            type="button"
            className="chat-topbar__action chat-topbar__share"
            onClick={onShare}
            disabled={isLoading}
            aria-label={SHARE_LABEL}
            title={SHARE_LABEL}
          >
            <Icon
              name="share"
              size={ACTION_ICON_SIZE}
              strokeWidth={SHARE_ICON_STROKE}
              className="chat-topbar__share-icon"
            />
            <span className="chat-topbar__label">Share</span>
          </button>
        )}
      </div>
    </header>
  )
}
