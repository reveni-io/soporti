import Icon from '../../../common/Icon/Icon.jsx'
import { frameLoop } from '../frameLoop.js'
import { useCountUp } from '../hooks/useCountUp/useCountUp.js'
import { usePlayOnView } from '../hooks/usePlayOnView/usePlayOnView.js'
import { staggerStyle } from '../stagger.js'
import './AnalyticsTile.css'

const PROMPT = 'Returns per week, by status'
const AGENT_STEPS = [
  'Exploring the schema…',
  'Reading the columns of returns…',
  'Trying a query…',
  'Drawing the chart…',
]
const CHART_FRAME = AGENT_STEPS.length
const STEP_MS = 1300
const CHART_HOLD_MS = 4600
const VIEW_THRESHOLD = 0.4

const RETURNS_THIS_MONTH = 1284
const COUNT_UP_MS = 1800
const NUMBER_FORMAT = new Intl.NumberFormat('en-US')
const WEEKLY_ORDERS = [46, 58, 52, 67, 61, 78, 72, 92]
const SERIES = [
  { label: 'Approved', path: 'M0 58 C 24 54, 40 44, 64 46 S 104 32, 128 28 S 176 16, 200 10' },
  { label: 'Pending', path: 'M0 70 C 24 68, 44 64, 64 58 S 104 62, 128 54 S 176 50, 200 44' },
]
const ICON_SIZE = 14

const playGeneration = frameLoop([
  ...AGENT_STEPS.map((_, index) => ({ frame: index, ms: STEP_MS })),
  { frame: CHART_FRAME, ms: CHART_HOLD_MS },
])

export default function AnalyticsTile() {
  const { ref, frame } = usePlayOnView({
    play: playGeneration,
    initialFrame: 0,
    finalFrame: CHART_FRAME,
    threshold: VIEW_THRESHOLD,
  })
  const count = useCountUp({ target: RETURNS_THIS_MONTH, durationMs: COUNT_UP_MS })

  return (
    <div className="lp-analytics-tile" ref={ref} aria-hidden="true">
      <div className="lp-analytics-tile__ask">
        <Icon name="spark" size={ICON_SIZE} />
        <span className="lp-analytics-tile__prompt">{PROMPT}</span>
        <span className="lp-analytics-tile__create">Create chart</span>
      </div>

      <div className="lp-analytics-tile__grid">
        <div className="lp-analytics-tile__card">
          <span className="lp-analytics-tile__label">Returns this month</span>
          <span className="lp-analytics-tile__figure" ref={count.ref}>
            {NUMBER_FORMAT.format(count.value)}
          </span>
          <span className="lp-analytics-tile__delta">▲ 12% vs last month</span>
        </div>

        <div className="lp-analytics-tile__card">
          <span className="lp-analytics-tile__label">Orders per week</span>
          <div className="lp-analytics-tile__columns">
            {WEEKLY_ORDERS.map((value, index) => (
              <span
                key={index}
                className="lp-analytics-tile__column"
                style={{ height: `${value}%`, ...staggerStyle(index) }}
              />
            ))}
          </div>
        </div>

        <div className="lp-analytics-tile__card lp-analytics-tile__card--tall">
          <span className="lp-analytics-tile__label">{PROMPT}</span>
          {frame === CHART_FRAME ? <LinePlot /> : <Generating step={AGENT_STEPS[frame]} />}
        </div>
      </div>
    </div>
  )
}

function Generating({ step }) {
  return (
    <div className="lp-analytics-tile__generating">
      <span className="lp-analytics-tile__skeleton" />
      <span className="lp-analytics-tile__skeleton lp-analytics-tile__skeleton--short" />
      <span key={step} className="lp-analytics-tile__step">
        <span className="lp-spinner" />
        {step}
      </span>
    </div>
  )
}

function LinePlot() {
  return (
    <div className="lp-analytics-tile__plot">
      <svg className="lp-analytics-tile__lines" viewBox="0 0 200 80" preserveAspectRatio="none">
        {SERIES.map((series, index) => (
          <path
            key={series.label}
            className={`lp-analytics-tile__line lp-analytics-tile__line--${index + 1}`}
            d={series.path}
            pathLength="1"
          />
        ))}
      </svg>
      <span className="lp-analytics-tile__legend">
        {SERIES.map((series, index) => (
          <span key={series.label} className={`lp-analytics-tile__key lp-analytics-tile__key--${index + 1}`}>
            {series.label}
          </span>
        ))}
      </span>
    </div>
  )
}
