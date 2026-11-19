import Icon from '../../../common/Icon/Icon.jsx'
import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import { frameLoop } from '../frameLoop.js'
import { usePlayOnView } from '../hooks/usePlayOnView/usePlayOnView.js'
import './ScheduleDemo.css'

const STAGE_WAITING = 0
const STAGE_RUNNING = 1
const STAGE_POSTED = 2
const VIEW_THRESHOLD = 0.3

const QUESTION = 'Every morning at 9, summarize the new Sentry issues in #support'
const SETTINGS = ['Daily · 09:00 Europe/Madrid', 'Tech profile', 'Sentry']
const PAST_RUNS = [
  { when: 'Yesterday 09:00', result: 'Posted to #support · 1 new issue' },
  { when: 'Mon 09:00', result: 'Posted to #support · nothing new' },
]
const POST = {
  title: '2 new Sentry issues since yesterday',
  items: ['CHECKOUT-482 · 212 events · gift card carts', 'REFUNDS-212 · 48 events · missing currency'],
}
const ICON_SIZE = 12

const playSchedule = frameLoop([
  { frame: STAGE_WAITING, ms: 1800 },
  { frame: STAGE_RUNNING, ms: 2200 },
  { frame: STAGE_POSTED, ms: 5000 },
])

const TODAY_STATUS = {
  [STAGE_WAITING]: 'Next run at 09:00',
  [STAGE_RUNNING]: 'Running now…',
  [STAGE_POSTED]: 'Posted to #support · 2 new issues',
}

export default function ScheduleDemo() {
  const { ref, frame: stage } = usePlayOnView({
    play: playSchedule,
    initialFrame: STAGE_WAITING,
    finalFrame: STAGE_POSTED,
    threshold: VIEW_THRESHOLD,
  })

  return (
    <div className="lp-schedule-demo" ref={ref} aria-hidden="true">
      <PreviewWindow title="Scheduled queries" badge={stage === STAGE_POSTED ? 'Posted' : null}>
        <div className="lp-schedule-demo__body">
          <div className="lp-schedule-demo__query">
            <p className="lp-schedule-demo__question">{QUESTION}</p>
            <div className="lp-schedule-demo__settings">
              {SETTINGS.map(setting => (
                <span key={setting} className="chip chip--pill">
                  {setting}
                </span>
              ))}
            </div>
          </div>

          <ol className="lp-schedule-demo__runs">
            <li className={`lp-schedule-demo__run lp-schedule-demo__run--stage-${stage}`}>
              <span className="lp-schedule-demo__marker" />
              <span className="lp-schedule-demo__when">Today 09:00</span>
              <span key={stage} className="lp-schedule-demo__result">
                {TODAY_STATUS[stage]}
              </span>
            </li>
            {PAST_RUNS.map(run => (
              <li key={run.when} className="lp-schedule-demo__run lp-schedule-demo__run--past">
                <span className="lp-schedule-demo__marker" />
                <span className="lp-schedule-demo__when">{run.when}</span>
                <span className="lp-schedule-demo__result">{run.result}</span>
              </li>
            ))}
          </ol>

          {stage === STAGE_POSTED && (
            <div className="lp-schedule-demo__post">
              <span className="lp-schedule-demo__channel">
                <IntegrationIcon id="slack" size={ICON_SIZE} />
                #support
                <Icon name="clock" size={ICON_SIZE} />
                09:00
              </span>
              <strong>{POST.title}</strong>
              <ul>
                {POST.items.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </PreviewWindow>
    </div>
  )
}
