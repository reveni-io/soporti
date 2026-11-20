import Icon from '../../../common/Icon/Icon.jsx'
import ReveniLogo from '../ReveniLogo/ReveniLogo.jsx'
import { frameLoop } from '../frameLoop.js'
import { usePlayOnView } from '../hooks/usePlayOnView/usePlayOnView.js'
import './AppTile.css'

const NOTIFICATIONS = [
  { title: 'Sales bot', body: '3 refunds over €500 since yesterday, all from the same merchant.' },
  { title: 'Your answer is ready', body: 'Order 4521 was refunded twice because the webhook retried after a timeout.' },
  { title: 'Your video is ready', body: '“Emails that sound like you”, version\u00a02\u00a0(0:30).' },
]
const ALL_DELIVERED = NOTIFICATIONS.length
const CLEARING = ALL_DELIVERED + 1
const VIEW_THRESHOLD = 0.4

const DOCK_APPS = [
  { icon: 'clock', tone: 'orange' },
  { icon: 'code', tone: 'violet' },
  { icon: 'chart', tone: 'blue' },
]
const LOCK_TIME = '9:41'
const NOW_LABEL = 'now'
const LOCK_ICON_SIZE = 12
const DOCK_ICON_SIZE = 20
const DOCK_MARK_HEIGHT = 24
const NOTIFICATION_MARK_HEIGHT = 15

const playArrivals = frameLoop([
  { frame: 0, ms: 1200 },
  { frame: 1, ms: 2200 },
  { frame: 2, ms: 2200 },
  { frame: ALL_DELIVERED, ms: 5200 },
  { frame: CLEARING, ms: 600 },
])

function ageLabel(position) {
  if (position === 0) return NOW_LABEL

  return `${position}m`
}

export default function AppTile() {
  const { ref, frame } = usePlayOnView({
    play: playArrivals,
    initialFrame: 0,
    finalFrame: ALL_DELIVERED,
    threshold: VIEW_THRESHOLD,
  })
  const delivered = Math.min(frame, ALL_DELIVERED)

  return (
    <div className="lp-app-tile" ref={ref} aria-hidden="true">
      <Dock unreadCount={delivered} />
      <LockScreen notifications={NOTIFICATIONS.slice(0, delivered).reverse()} isClearing={frame === CLEARING} />
    </div>
  )
}

function Dock({ unreadCount }) {
  return (
    <div className="lp-app-tile__dock">
      {DOCK_APPS.map(app => (
        <span key={app.icon} className={`lp-app-tile__app lp-app-tile__app--${app.tone}`}>
          <Icon name={app.icon} size={DOCK_ICON_SIZE} />
        </span>
      ))}
      <span className="lp-app-tile__app lp-app-tile__app--soporti">
        <ReveniLogo height={DOCK_MARK_HEIGHT} />
        {unreadCount > 0 && (
          <span key={unreadCount} className="lp-app-tile__badge">
            {unreadCount}
          </span>
        )}
      </span>
    </div>
  )
}

function LockScreen({ notifications, isClearing }) {
  const listModifier = isClearing ? ' lp-app-tile__notifications--clearing' : ''

  return (
    <div className="lp-app-tile__phone">
      <div className="lp-app-tile__screen">
        <span className="lp-app-tile__island" />
        <span className="lp-app-tile__lock">
          <Icon name="lock" size={LOCK_ICON_SIZE} />
        </span>
        <span className="lp-app-tile__time">{LOCK_TIME}</span>

        <ul className={`lp-app-tile__notifications${listModifier}`}>
          {notifications.map((notification, position) => (
            <li key={notification.title} className="lp-app-tile__notification">
              <span className="lp-app-tile__icon">
                <ReveniLogo height={NOTIFICATION_MARK_HEIGHT} />
              </span>
              <span className="lp-app-tile__title">{notification.title}</span>
              <span className="lp-app-tile__age">{ageLabel(position)}</span>
              <span className="lp-app-tile__body">{notification.body}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
