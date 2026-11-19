import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import { frameLoop } from '../frameLoop.js'
import { usePlayOnView } from '../hooks/usePlayOnView/usePlayOnView.js'
import './SlackThreadDemo.css'

const VIEW_THRESHOLD = 0.3
const QUESTION = {
  author: 'Marta',
  initial: 'M',
  time: '10:42',
  text: 'why are refunds failing for Acme since this morning?',
}
const STEPS = [
  { title: 'Searching logs', details: 'refund failed · since 09:00' },
  { title: 'Reading file', details: 'src/refunds/service.js' },
  { title: 'Opening Sentry issue', details: 'REFUNDS-212' },
]
const ANSWER = [
  'Since the 09:10 deploy, partial refunds reach the payment provider without a currency, so it rejects them.',
  ' Sentry has 212 events of the same error, all from Acme’s EUR store.',
]
const FIRST_ANSWER_FRAME = STEPS.length + 1
const FINAL_FRAME = FIRST_ANSWER_FRAME + 1

const playThread = frameLoop([
  { frame: 0, ms: 1400 },
  ...STEPS.map((_, index) => ({ frame: index + 1, ms: 1100 })),
  { frame: FIRST_ANSWER_FRAME, ms: 1000 },
  { frame: FINAL_FRAME, ms: 4600 },
])

function stepState(index, frame) {
  if (frame > index + 1) return 'done'

  return 'running'
}

export default function SlackThreadDemo() {
  const { ref, frame } = usePlayOnView({
    play: playThread,
    initialFrame: 0,
    finalFrame: FINAL_FRAME,
    threshold: VIEW_THRESHOLD,
  })
  const visibleSteps = STEPS.slice(0, frame)
  const answer = ANSWER.slice(0, Math.max(0, frame - STEPS.length))

  return (
    <div className="lp-slack-demo" ref={ref} aria-hidden="true">
      <PreviewWindow title="#support" badge="Slack">
        <div className="lp-slack-demo__body">
          <div className="lp-slack-demo__message">
            <span className="lp-slack-demo__avatar">{QUESTION.initial}</span>
            <div className="lp-slack-demo__content">
              <span className="lp-slack-demo__meta">
                <strong>{QUESTION.author}</strong> {QUESTION.time}
              </span>
              <p>
                <span className="lp-slack-demo__mention">@Soporti</span> {QUESTION.text}
              </p>
            </div>
          </div>

          {frame > 0 && (
            <div className="lp-slack-demo__message lp-slack-demo__message--reply">
              <span className="lp-slack-demo__avatar lp-slack-demo__avatar--bot">S</span>
              <div className="lp-slack-demo__content">
                <span className="lp-slack-demo__meta">
                  <strong>Soporti</strong> <span className="lp-slack-demo__app">APP</span> {QUESTION.time}
                </span>
                <ul className="lp-slack-demo__steps">
                  {visibleSteps.map((step, index) => (
                    <li
                      key={step.title}
                      className={`lp-slack-demo__step lp-slack-demo__step--${stepState(index, frame)}`}
                    >
                      <span className={stepState(index, frame) === 'done' ? 'lp-done-dot' : 'lp-spinner'} />
                      <strong>{step.title}</strong>
                      <span className="lp-slack-demo__details">{step.details}</span>
                    </li>
                  ))}
                </ul>
                {answer.length > 0 && <p className="lp-slack-demo__answer">{answer.join('')}</p>}
              </div>
            </div>
          )}
        </div>
      </PreviewWindow>
    </div>
  )
}
