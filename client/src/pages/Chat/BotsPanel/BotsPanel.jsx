import { Link, generatePath } from 'react-router-dom'
import BotAvatar from '../../../common/BotAvatar/BotAvatar.jsx'
import Icon from '../../../common/Icon/Icon.jsx'
import { ROUTES } from '../../../router/constants.js'
import SidebarToggles from '../SidebarToggles/SidebarToggles.jsx'
import './BotsPanel.css'

const CARD_AVATAR_SIZE = 44
const EMPTY_AVATAR_SEED = 'soporti-bots'
const EMPTY_AVATAR_SIZE = 72
const NEW_BOT_ICON_SIZE = 14

export default function BotsPanel({
  bots,
  loading,
  error,
  onCreate,
  isSidebarCollapsed,
  onOpenSidebar,
  onExpandSidebar,
}) {
  return (
    <section className="bots-panel">
      <div className="bots-panel__content">
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

        <BotGrid bots={bots} loading={loading} error={error} onCreate={onCreate} />
      </div>
    </section>
  )
}

function BotGrid({ bots, loading, error, onCreate }) {
  if (loading) return <p className="bots-panel__status">Loading…</p>
  if (error && bots.length === 0) {
    return (
      <p className="alert alert--error bots-panel__error" role="alert">
        {error}
      </p>
    )
  }
  if (bots.length === 0) return <BotsEmptyState onCreate={onCreate} />

  return (
    <ul className="bots-panel__grid">
      {bots.map(bot => (
        <BotCard key={bot.id} bot={bot} />
      ))}
    </ul>
  )
}

function BotCard({ bot }) {
  return (
    <li className="bots-panel__item">
      <Link className="card bots-panel__card" to={generatePath(ROUTES.BOT, { botId: String(bot.id) })}>
        <BotAvatar seed={bot.avatarSeed} size={CARD_AVATAR_SIZE} />
        <div className="bots-panel__card-body">
          <span className="bots-panel__name">{bot.name}</span>
          <p className="bots-panel__description">{bot.description}</p>
        </div>
        {bot.unreadCount > 0 && (
          <span className="badge badge--success bots-panel__unread" aria-label={`${bot.unreadCount} new`}>
            {bot.unreadCount}
          </span>
        )}
      </Link>
    </li>
  )
}

function BotsEmptyState({ onCreate }) {
  return (
    <div className="bots-panel__empty">
      <BotAvatar seed={EMPTY_AVATAR_SEED} size={EMPTY_AVATAR_SIZE} />
      <h3 className="bots-panel__empty-title">Your own assistants</h3>
      <p className="bots-panel__empty-text">
        A bot is a private assistant with a job you describe. It works with every connected tool, keeps one ongoing chat
        with you, and can run routines on its own, like reviewing the new tickets every weekday at 17:00 and telling you
        what it found.
      </p>
      <button type="button" className="btn btn--primary" onClick={onCreate}>
        Create a bot
      </button>
    </div>
  )
}
