import Icon from '../../../common/Icon/Icon.jsx'
import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import Section from '../Section/Section.jsx'
import SectionHeading from '../SectionHeading/SectionHeading.jsx'
import { SECTION_IDS } from '../constants.js'
import { staggerStyle } from '../stagger.js'
import './GuardsSection.css'

const ICON_SIZE = 18
const FIRST_POINT_INDEX = 3

const POINTS = [
  {
    icon: 'check',
    title: 'A guard for each job',
    text: 'Create a guard for anything you want checked, like replies to customers or pull request approvals, each with the questions it must answer and the answers that warn. Every change is versioned, so you know which questions checked what.',
  },
  {
    icon: 'shield',
    title: 'Not sure means careful',
    text: 'Every answer comes back with how sure Jev is. Below the minimum you set, it raises a warning: a guard never lets a guess through quietly.',
  },
  {
    icon: 'zap',
    title: 'Wherever you ask',
    text: 'Ask for guards by name in the chat, Slack, MCP, a scheduled query or a bot, like “use the Legal guards”. They only warn: a person decides, and a reply goes out only when someone sends it.',
  },
]

const ANSWERS = [
  { question: 'Does the reply promise what the data does not show?', answer: 'No', confidence: '95', isSure: true },
  { question: 'Is the customer asking for something unusual?', answer: 'No', confidence: '92', isSure: true },
  { question: 'Does the reply share data of someone else?', answer: 'No', confidence: '64', isSure: false },
]

export default function GuardsSection() {
  return (
    <Section id={SECTION_IDS.GUARDS}>
      <div className="lp-guards">
        <div className="lp-guards__visual lp-rise" style={staggerStyle(2)} aria-hidden="true">
          <PreviewWindow title="Legal guard · reply to ticket 48213" badge="Careful">
            <div className="lp-guards__body">
              <p className="lp-guards__intro">
                “Pass the reply through the Legal guard.” Jev answered its three questions.
              </p>
              <ul className="lp-guards__answers">
                {ANSWERS.map(row => (
                  <li
                    key={row.question}
                    className={`lp-guards__answer${row.isSure ? '' : ' lp-guards__answer--unsure'}`}
                  >
                    <span className="lp-guards__question">{row.question}</span>
                    <span className="lp-guards__value">
                      {row.answer} · {row.confidence}
                    </span>
                    <span className="lp-guards__check">{row.isSure ? 'OK' : 'Not sure'}</span>
                  </li>
                ))}
              </ul>
              <p className="lp-guards__verdict">
                Not sure about one answer (64 &lt; 75), so the case shows a warning before anyone sends the reply.
              </p>
            </div>
          </PreviewWindow>
        </div>

        <div className="lp-guards__copy">
          <SectionHeading
            eyebrow="Guards"
            title={
              <>
                Soporti is <em>more secure</em> with guards.
              </>
            }
            lead="Before a reply reaches a customer or a pull request is approved, Soporti can pass it through a guard: Jev, TypeSafe’s question-answering model, answers the questions you wrote, each with how sure it is."
          />
          <ul className="lp-guards__points">
            {POINTS.map((point, index) => (
              <li
                key={point.title}
                className="lp-guards__point lp-rise"
                style={staggerStyle(FIRST_POINT_INDEX + index)}
              >
                <span className="lp-icon-tile">
                  <Icon name={point.icon} size={ICON_SIZE} />
                </span>
                <span>
                  <strong>{point.title}</strong>
                  {point.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}
