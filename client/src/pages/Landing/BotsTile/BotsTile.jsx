import BotAvatar from '../../../common/BotAvatar/BotAvatar.jsx'
import Icon from '../../../common/Icon/Icon.jsx'
import { frameLoop } from '../frameLoop.js'
import { usePlayOnView } from '../hooks/usePlayOnView/usePlayOnView.js'
import './BotsTile.css'

const STAGE_ASKED = 0
const STAGE_SCHEDULED = 1
const STAGE_RUNNING = 2
const STAGE_REPORTED = 3
const VIEW_THRESHOLD = 0.4

const BOT = {
  name: 'Ticket Triage',
  description: 'Watches the new Zendesk tickets',
  seed: 'ticket-triage',
  avatarStyle: { shape: 'cloud', hue: 195, tone: 'mid', mood: 'happy' },
}
const OTHER_BOTS = [
  { seed: 'release-notes', avatarStyle: { shape: 'capsule', hue: 270, tone: 'deep', mood: 'neutral' }, unreadCount: 0 },
  { seed: 'sentry-sweeper', avatarStyle: { shape: 'sun', hue: 40, tone: 'mid', mood: 'wink' }, unreadCount: 1 },
  { seed: 'merchant-pulse', avatarStyle: { shape: 'round', hue: 140, tone: 'pastel', mood: 'sleepy' }, unreadCount: 0 },
]
const REQUEST = 'Every weekday at 17:00, tell me which new tickets are urgent'
const ROUTINE = { title: 'Daily ticket sweep', schedule: 'Weekdays · 17:00' }
const REPORT = { summary: '2 urgent out of 14 new tickets', detail: '#4821 · refunds fail since the 15:10 deploy' }

const LIST_AVATAR_SIZE = 30
const ICON_SIZE = 12

const playRoutine = frameLoop([
  { frame: STAGE_ASKED, ms: 1600 },
  { frame: STAGE_SCHEDULED, ms: 2200 },
  { frame: STAGE_RUNNING, ms: 2400 },
  { frame: STAGE_REPORTED, ms: 4800 },
])

export default function BotsTile() {
  const { ref, frame: stage } = usePlayOnView({
    play: playRoutine,
    initialFrame: STAGE_ASKED,
    finalFrame: STAGE_REPORTED,
    threshold: VIEW_THRESHOLD,
  })
  const isRunning = stage === STAGE_RUNNING

  return (
    <div className="lp-bots-tile" ref={ref} aria-hidden="true">
      <ul className="lp-bots-tile__list">
        <li className="lp-bots-tile__item lp-bots-tile__item--active">
          <BotAvatar seed={BOT.seed} avatarStyle={BOT.avatarStyle} size={LIST_AVATAR_SIZE} isThinking={isRunning} />
        </li>
        {OTHER_BOTS.map(bot => (
          <li key={bot.seed} className="lp-bots-tile__item">
            <BotAvatar seed={bot.seed} avatarStyle={bot.avatarStyle} size={LIST_AVATAR_SIZE} />
            {bot.unreadCount > 0 && <span className="lp-bots-tile__badge">{bot.unreadCount}</span>}
          </li>
        ))}
      </ul>

      <div className="lp-bots-tile__chat">
        <div className="lp-bots-tile__header">
          <span className="lp-bots-tile__name">{BOT.name}</span>
          <span className="lp-bots-tile__description">{BOT.description}</span>
        </div>

        <div className="lp-bots-tile__feed">
          <p className="lp-bots-tile__request">{REQUEST}</p>
          {stage >= STAGE_SCHEDULED && (
            <div className="lp-bots-tile__card lp-bots-tile__routine">
              <Icon name="clock" size={ICON_SIZE} />
              <span className="lp-bots-tile__routine-title">{ROUTINE.title}</span>
              <span className="lp-bots-tile__routine-when">
                {isRunning && <span className="lp-spinner" />}
                {isRunning ? 'Running now' : ROUTINE.schedule}
              </span>
            </div>
          )}
          {stage === STAGE_REPORTED && (
            <div className="lp-bots-tile__card lp-bots-tile__report">
              <span className="lp-bots-tile__unread" />
              <strong>{REPORT.summary}</strong>
              <span>{REPORT.detail}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
