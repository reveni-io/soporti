import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import Section from '../Section/Section.jsx'
import { QUESTIONS } from './questions.js'

const TAG_ICON_SIZE = 14

export default function AskSection() {
  return (
    <Section id="ask" className="lp-section--white">
      <div className="lp-section__head">
        <span className="lp-eyebrow">What you can ask</span>
        <h2 className="lp-h2">Real questions, answered from the real system.</h2>
        <p className="lp-lead">
          Skip the code archaeology and the “who knows this?” Slack thread. Ask in plain language and Soporti figures
          out which repos, databases and docs to look in.
        </p>
      </div>
      <div className="lp-ask__grid">
        {QUESTIONS.map(question => (
          <div className="lp-qcard" key={question.text}>
            <span className="lp-qcard__tag">
              <IntegrationIcon id={question.icon} size={TAG_ICON_SIZE} />
              {question.tag}
            </span>
            <p className="lp-qcard__text">{question.text}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}
