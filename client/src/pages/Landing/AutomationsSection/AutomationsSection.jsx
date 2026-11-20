import Icon from '../../../common/Icon/Icon.jsx'
import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import PrReviewDemo from '../PrReviewDemo/PrReviewDemo.jsx'
import ScheduleDemo from '../ScheduleDemo/ScheduleDemo.jsx'
import Section from '../Section/Section.jsx'
import SectionHeading from '../SectionHeading/SectionHeading.jsx'
import SlackThreadDemo from '../SlackThreadDemo/SlackThreadDemo.jsx'
import { SECTION_IDS } from '../constants.js'
import { useAutoCycle } from '../hooks/useAutoCycle/useAutoCycle.js'
import { staggerStyle } from '../stagger.js'
import './AutomationsSection.css'

const CYCLE_MS = 10000
const ICON_SIZE = 18
const PANEL_ID = 'lp-automations-panel'

const AUTOMATIONS = [
  {
    id: 'reviews',
    icon: <IntegrationIcon id="github" size={ICON_SIZE} />,
    title: 'Reviews every pull request',
    text: 'Request a review, add a label or comment “@soporti review”. Agents hunt bugs, security holes and broken standards in parallel, and a verifier tries to refute every finding before it is posted.',
    Demo: PrReviewDemo,
  },
  {
    id: 'slack',
    icon: <IntegrationIcon id="slack" size={ICON_SIZE} />,
    title: 'Answers in Slack threads',
    text: 'Mention it in any channel and the reply is a live card: every source it opens shows up as a step, and the answer writes itself in underneath.',
    Demo: SlackThreadDemo,
  },
  {
    id: 'schedule',
    icon: <Icon name="clock" size={ICON_SIZE} />,
    title: 'Runs on a schedule',
    text: 'Save a question with a cadence, hourly to monthly in your own time zone. Each run lands as a conversation you can continue, or as a post in the channel you named.',
    Demo: ScheduleDemo,
  },
]

export default function AutomationsSection() {
  const cycle = useAutoCycle({ count: AUTOMATIONS.length, intervalMs: CYCLE_MS })
  const { id, Demo } = AUTOMATIONS[cycle.active]

  return (
    <Section id={SECTION_IDS.AUTOMATIONS}>
      <SectionHeading
        eyebrow="Beyond the chat"
        title={
          <>
            It keeps working <em>when nobody is asking</em>.
          </>
        }
        lead="The same brain that answers in the chat reviews your pull requests, replies in Slack threads and runs your questions on a schedule."
      />

      <div className="lp-automations lp-rise" style={staggerStyle(3)} ref={cycle.ref} {...cycle.hoverProps}>
        <div className="lp-automations__list" role="tablist" aria-label="Automations" aria-orientation="vertical">
          {AUTOMATIONS.map((automation, index) => (
            <AutomationTab
              key={automation.id}
              automation={automation}
              isActive={index === cycle.active}
              progressKey={cycle.progressKey}
              onSelect={() => cycle.select(index)}
            />
          ))}
        </div>

        <div
          key={id}
          className="lp-automations__stage"
          role="tabpanel"
          id={PANEL_ID}
          aria-labelledby={`lp-automations-tab-${id}`}
        >
          <Demo />
        </div>
      </div>
    </Section>
  )
}

function AutomationTab({ automation, isActive, progressKey, onSelect }) {
  return (
    <button
      type="button"
      role="tab"
      id={`lp-automations-tab-${automation.id}`}
      className={`lp-automations__tab lp-focusable${isActive ? ' lp-automations__tab--active' : ''}`}
      aria-selected={isActive}
      aria-controls={PANEL_ID}
      onClick={onSelect}
    >
      <span className="lp-automations__icon">{automation.icon}</span>
      <span className="lp-automations__copy">
        <span className="lp-automations__title">{automation.title}</span>
        <span className="lp-automations__text">
          <span>{automation.text}</span>
        </span>
      </span>
      {isActive && progressKey && (
        <span key={progressKey} className="lp-progress-bar" style={{ animationDuration: `${CYCLE_MS}ms` }} />
      )}
    </button>
  )
}
