import BotAvatar from '../../../common/BotAvatar/BotAvatar.jsx'
import Icon from '../../../common/Icon/Icon.jsx'
import Section from '../Section/Section.jsx'
import PointList from '../PointList/PointList.jsx'
import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import './BotsSection.css'

const POINTS = [
  'Private to you: a name, a description of its job, a support or tech profile and an animated avatar of its own. Pick its shape, color, tone and mood, or shuffle until you like it, and it looks thoughtful while it works',
  'It greets you from its description the moment it is created, so you see it understood the job before you hand it any work',
  'Ask for something recurring in plain words — “every weekday at 17:00”, “every Monday at 9”, “once, on Friday at 10” — and it creates the routine from the chat, then confirms the schedule',
  'Every run posts its report into the bot’s chat, tagged with the routine, and an unread dot tells you which bot has news; ask a follow-up right below it',
  'It works with every integration you configured, unattended: it reports what it did, and posts to Slack when the routine says so',
  'Each run knows what it reported last time, and a “tell me if…” routine stays silent when there is nothing new',
]

const BOT = {
  name: 'Ticket Triage',
  description: 'Keeps an eye on the new Zendesk tickets and tells me which ones need me first.',
  avatarSeed: 'ticket-triage',
  avatarStyle: { shape: 'cloud', hue: 195, tone: 'mid', mood: 'happy' },
}

const GREETING =
  'Hi! I’m Ticket Triage. I’ll keep an eye on the new Zendesk tickets and tell you which ones need you first. Want me to go through them on a schedule?'
const REQUEST = 'Yes: every weekday at 17:00, go through the day’s new tickets and tell me which ones are urgent.'

const ROUTINE = {
  title: 'Daily ticket sweep',
  schedule: 'every weekday at 17:00 (Europe/Madrid)',
  ranAt: 'Today, 17:00',
}

const REPORT_SUMMARY = '14 new tickets today, 2 of them urgent:'
const REPORT_ITEMS = [
  '#4821: refunds fail for one merchant since the 15:10 deploy, and Sentry has 212 events of the same error',
  '#4830: a customer was charged twice for one order',
]

const HEAD_AVATAR_SIZE = 36
const ROUTINE_ICON_SIZE = 12

export default function BotsSection() {
  return (
    <Section id="bots" className="lp-section--cool">
      <div className="lp-split">
        <div>
          <span className="lp-eyebrow">Bots</span>
          <h2 className="lp-h2">
            Describe a job once. A <em>bot</em> keeps doing it on schedule.
          </h2>
          <p className="lp-lead">
            A bot is your own assistant with a name, a face and a purpose written in your words. It has a single chat
            that never expires: talk to it like you talk to Soporti, or tell it what to do every weekday at 17:00 and it
            sets up the routine itself. Each run lands in that same chat, so the report and your follow-up sit together.
          </p>
          <PointList points={POINTS} />
        </div>

        <div className="lp-split__visual">
          <PreviewWindow className="lp-bots" badge="Bots">
            <div className="lp-bots__head">
              <BotAvatar seed={BOT.avatarSeed} avatarStyle={BOT.avatarStyle} size={HEAD_AVATAR_SIZE} />
              <div className="lp-bots__who">
                <span className="lp-bots__name">{BOT.name}</span>
                <span className="lp-bots__description">{BOT.description}</span>
              </div>
              <span className="btn btn--secondary btn--sm lp-bots__routines">
                <Icon name="clock" size={ROUTINE_ICON_SIZE} />
                Routines
              </span>
            </div>

            <ol className="lp-bots__messages" aria-label={`Chat with ${BOT.name}`}>
              <BotMessage>
                <p>{GREETING}</p>
              </BotMessage>

              <li className="message message--user">
                <div className="message__bubble message__bubble--user">{REQUEST}</div>
              </li>

              <BotMessage>
                <p>
                  Done. I created the routine <strong>{ROUTINE.title}</strong>: {ROUTINE.schedule}. The first run is
                  today.
                </p>
              </BotMessage>

              <BotMessage isReport>
                <div className="lp-bots__routine">
                  <span className="lp-bots__unread" aria-hidden="true" />
                  <Icon name="clock" size={ROUTINE_ICON_SIZE} />
                  <span>Routine · {ROUTINE.title}</span>
                  <span className="lp-bots__time">{ROUTINE.ranAt}</span>
                </div>
                <p>{REPORT_SUMMARY}</p>
                <ul>
                  {REPORT_ITEMS.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </BotMessage>
            </ol>
          </PreviewWindow>
        </div>
      </div>
    </Section>
  )
}

function BotMessage({ isReport = false, children }) {
  return (
    <li className="message message--assistant">
      <div className={`message__bubble message__bubble--assistant${isReport ? ' lp-bots__report' : ''}`}>
        {children}
      </div>
    </li>
  )
}
