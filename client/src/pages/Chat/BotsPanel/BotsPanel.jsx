import { NavLink, generatePath } from 'react-router-dom'
import BotAvatar from '../../../common/BotAvatar/BotAvatar.jsx'
import Icon from '../../../common/Icon/Icon.jsx'
import SharedElement from '../../../common/SharedElement/SharedElement.jsx'
import { ROUTES } from '../../../router/constants.js'
import SidebarToggles from '../SidebarToggles/SidebarToggles.jsx'
import './BotsPanel.css'

const ROW_AVATAR_SIZE = 36
const NEW_BOT_ICON_SIZE = 14
const SELECTION_TRANSITION_NAME = 'bots-panel-selection'
const THINKING_TEXT = 'Thinking…'
const NO_BUSY_BOTS = []

function rowClassName({ isActive }) {
  return isActive ? 'bots-panel__row bots-panel__row--active' : 'bots-panel__row'
}

export default function BotsPanel({
  bots,
  busyBotIds = NO_BUSY_BOTS,
  loading,
  error,
  isBotOpen = false,
  onCreate,
  isSidebarCollapsed,
  onOpenSidebar,
  onExpandSidebar,
}) {
  const className = isBotOpen ? 'bots-panel bots-panel--bot-open' : 'bots-panel'

  return (
    <section className={className}>
      <header className="bots-panel__header">
        <SidebarToggles
          isSidebarCollapsed={isSidebarCollapsed}
          onOpenSidebar={onOpenSidebar}
          onExpandSidebar={onExpandSidebar}
        />
        <h2 className="bots-panel__title">Bots</h2>
        <button type="button" className="btn btn--primary btn--sm bots-panel__new" onClick={onCreate}>
          <Icon name="plus" size={NEW_BOT_ICON_SIZE} />
          New bot
        </button>
      </header>

      <BotList bots={bots} busyBotIds={busyBotIds} loading={loading} error={error} />
    </section>
  )
}

function BotList({ bots, busyBotIds, loading, error }) {
  if (loading) return <p className="bots-panel__status">Loading…</p>
  if (error && bots.length === 0) {
    return (
      <p className="alert alert--error bots-panel__error" role="alert">
        {error}
      </p>
    )
  }
  if (bots.length === 0) return <p className="bots-panel__status">No bots yet.</p>

  return (
    <nav className="bots-panel__list" aria-label="Bots">
      <ul className="bots-panel__items">
        {bots.map(bot => (
          <li key={bot.id}>
            <NavLink className={rowClassName} to={generatePath(ROUTES.BOT, { botId: String(bot.id) })}>
              {({ isActive }) => (
                <BotRowContent bot={bot} isActive={isActive} isThinking={busyBotIds.includes(bot.id)} />
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function BotRowContent({ bot, isActive, isThinking }) {
  return (
    <>
      {isActive && (
        <SharedElement name={SELECTION_TRANSITION_NAME}>
          <span className="bots-panel__selection" aria-hidden="true" />
        </SharedElement>
      )}
      <BotAvatar
        seed={bot.avatarSeed}
        avatarStyle={bot.avatarStyle}
        size={ROW_AVATAR_SIZE}
        className="bots-panel__avatar"
        isThinking={isThinking}
      />
      <span className="bots-panel__text">
        <span className="bots-panel__name">{bot.name}</span>
        {isThinking ? (
          <span className="bots-panel__description bots-panel__description--thinking">{THINKING_TEXT}</span>
        ) : (
          <span className="bots-panel__description">{bot.description}</span>
        )}
      </span>
      {bot.unreadCount > 0 && (
        <span className="badge badge--success bots-panel__unread" aria-label={`${bot.unreadCount} new`}>
          {bot.unreadCount}
        </span>
      )}
    </>
  )
}
