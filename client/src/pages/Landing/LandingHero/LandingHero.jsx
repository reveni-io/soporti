import GridPattern from '../../../common/GridPattern/GridPattern.jsx'
import Icon from '../../../common/Icon/Icon.jsx'
import CtaButton from '../CtaButton/CtaButton.jsx'
import HeroChat from '../HeroChat/HeroChat.jsx'
import { SCENARIOS } from '../HeroChat/scenarios.js'
import { useScenarioPlayer } from '../hooks/useScenarioPlayer/useScenarioPlayer.js'
import { GITHUB_CTA, GITHUB_URL, SECTION_IDS } from '../constants.js'
import './LandingHero.css'

const ARROW_STROKE = 2.2
const SMALL_ICON_SIZE = 12
const TOPICS = SCENARIOS.map(scenario => scenario.topic)
const ACCESSIBLE_TITLE = `Ask anything about your ${TOPICS.slice(0, -1).join(', ')} and ${TOPICS.at(-1)}`
const PROOF = ['Open source, runs on your servers', 'OpenAI or Anthropic', 'Read-only unless you say so']

export default function LandingHero({ cta, isIntroPlaying = false }) {
  const { messages, index } = useScenarioPlayer(SCENARIOS, { isEnabled: !isIntroPlaying })
  const primary = cta ?? GITHUB_CTA
  const topic = TOPICS[index]

  return (
    <header className="lp-hero">
      <div className="lp-hero__backdrop" aria-hidden="true">
        <div className="lp-hero__grid">
          <GridPattern variant="dark" />
        </div>
        <span className="lp-hero__aurora lp-hero__aurora--one" />
        <span className="lp-hero__aurora lp-hero__aurora--two" />
        <span className="lp-hero__aurora lp-hero__aurora--three" />
      </div>

      <div className="lp__inner lp-hero__inner">
        <a className="lp-hero__badge lp-focusable" href={GITHUB_URL} target="_blank" rel="noreferrer">
          <span className="lp-hero__badge-dot" />
          Open source · Safe by design
          <Icon name="arrow-right" size={SMALL_ICON_SIZE} strokeWidth={ARROW_STROKE} />
        </a>

        <h1 className="lp-hero__title">
          <span className="lp-sr-only">{ACCESSIBLE_TITLE}</span>
          <span aria-hidden="true">
            Ask anything about
            <br />
            your{' '}
            <span className="lp-hero__topic">
              <span key={topic} className="lp-hero__topic-word lp-gradient-text">
                {topic}
              </span>
            </span>
          </span>
        </h1>

        <p className="lp-hero__subtitle">
          Soporti reads the code, queries production data and searches docs, tickets and errors, then explains what it
          found in plain language. In the chat, in Slack and in your pull requests.
        </p>

        <div className="lp-hero__cta">
          <CtaButton cta={primary} />
          <a className="lp-btn lp-btn--ghost" href={`#${SECTION_IDS.ANSWERS}`}>
            See it in action
          </a>
        </div>

        <ul className="lp-hero__proof">
          {PROOF.map(item => (
            <li key={item}>
              <Icon name="check" size={SMALL_ICON_SIZE} strokeWidth={ARROW_STROKE} />
              {item}
            </li>
          ))}
        </ul>

        <div className="lp-hero__visual">
          <HeroChat messages={messages} />
        </div>
      </div>
    </header>
  )
}
