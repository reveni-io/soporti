import BotAvatar from '../../../../common/BotAvatar/BotAvatar.jsx'
import Icon from '../../../../common/Icon/Icon.jsx'
import SharedElement from '../../../../common/SharedElement/SharedElement.jsx'
import { botAvatarTransitionName, botNameTransitionName } from '../../bot-transition-names.js'
import SidebarToggles from '../../SidebarToggles/SidebarToggles.jsx'
import './ChatTopbar.css'

const ACTION_ICON_SIZE = 15
const BOT_AVATAR_SIZE = 32
const SHARE_ICON_STROKE = 1.5
const TOUR_LABEL = 'What can I ask?'
const SHARE_LABEL = 'Share conversation'

export default function ChatTopbar({
  title,
  bot = null,
  canShare,
  isLoading,
  isSidebarCollapsed,
  onOpenSidebar,
  onExpandSidebar,
  onOpenTour,
  onShare,
  onOpenRoutines,
  onEditBot,
}) {
  return (
    <header className="chat-topbar">
      <div className="chat-topbar__lead">
        <SidebarToggles
          isSidebarCollapsed={isSidebarCollapsed}
          onOpenSidebar={onOpenSidebar}
          onExpandSidebar={onExpandSidebar}
        />
        <div className="chat-topbar__heading">
          {isLoading && <span className="chat-topbar__live" aria-hidden="true" />}
          {bot ? (
            <BotHeading bot={bot} isThinking={isLoading} />
          ) : (
            <h2 key={title} className="chat-topbar__title" title={title}>
              {title}
            </h2>
          )}
        </div>
      </div>

      <div className="chat-topbar__actions">
        {bot ? (
          <BotActions onOpenRoutines={onOpenRoutines} onEditBot={onEditBot} />
        ) : (
          <ChatActions canShare={canShare} isLoading={isLoading} onOpenTour={onOpenTour} onShare={onShare} />
        )}
      </div>
    </header>
  )
}

function BotHeading({ bot, isThinking }) {
  return (
    <>
      <SharedElement name={botAvatarTransitionName(bot.id)}>
        <BotAvatar seed={bot.avatarSeed} avatarStyle={bot.avatarStyle} size={BOT_AVATAR_SIZE} isThinking={isThinking} />
      </SharedElement>
      <div className="chat-topbar__bot">
        <SharedElement name={botNameTransitionName(bot.id)}>
          <h2 key={bot.name} className="chat-topbar__title" title={bot.name}>
            {bot.name}
          </h2>
        </SharedElement>
        <p className="chat-topbar__description" title={bot.description}>
          {bot.description}
        </p>
      </div>
    </>
  )
}

function BotActions({ onOpenRoutines, onEditBot }) {
  return (
    <>
      <button type="button" className="chat-topbar__action" onClick={onOpenRoutines} aria-label="Routines">
        <Icon name="clock" size={ACTION_ICON_SIZE} />
        <span className="chat-topbar__label">Routines</span>
      </button>
      <button type="button" className="chat-topbar__action" onClick={onEditBot} aria-label="Edit bot">
        <Icon name="edit" size={ACTION_ICON_SIZE} />
        <span className="chat-topbar__label">Edit</span>
      </button>
    </>
  )
}

function ChatActions({ canShare, isLoading, onOpenTour, onShare }) {
  return (
    <>
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
    </>
  )
}
