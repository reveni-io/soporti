import Icon from '../../../common/Icon/Icon.jsx'
import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import Section from '../Section/Section.jsx'
import SectionHeading from '../SectionHeading/SectionHeading.jsx'
import { SECTION_IDS } from '../constants.js'
import { staggerStyle } from '../stagger.js'
import './DecisionsSection.css'

const ICON_SIZE = 18
const FIRST_POINT_INDEX = 3

const POINTS = [
  {
    icon: 'check',
    title: 'Your questions, checked every time',
    text: 'Write what Soporti must check and which answers should stop it. The questions are versioned, so you always know which ones decided.',
  },
  {
    icon: 'shield',
    title: 'Not sure means no',
    text: 'Every answer comes back with how sure Jev is. Below the minimum you set, it counts as a no: Soporti never acts on a guess.',
  },
  {
    icon: 'zap',
    title: 'One switch for every call',
    text: 'One connection shared by every project, a switch that turns every call off at once, and the calls of each project in plain sight.',
  },
]

const ANSWERS = [
  { question: 'Does the change alter how money is refunded?', answer: 'No', confidence: '0.96', isSure: true },
  { question: 'Is the change covered by tests?', answer: 'Yes', confidence: '0.91', isSure: true },
  { question: 'Could the change expose personal data?', answer: 'No', confidence: '0.64', isSure: false },
]

export default function DecisionsSection() {
  return (
    <Section id={SECTION_IDS.DECISIONS}>
      <div className="lp-decisions">
        <div className="lp-decisions__visual lp-rise" style={staggerStyle(2)} aria-hidden="true">
          <PreviewWindow title="Before Soporti approves #491" badge="Held">
            <div className="lp-decisions__body">
              <p className="lp-decisions__intro">Soporti asked Jev three questions about the pull request.</p>
              <ul className="lp-decisions__answers">
                {ANSWERS.map(row => (
                  <li
                    key={row.question}
                    className={`lp-decisions__answer${row.isSure ? '' : ' lp-decisions__answer--unsure'}`}
                  >
                    <span className="lp-decisions__question">{row.question}</span>
                    <span className="lp-decisions__value">
                      {row.answer} · {row.confidence}
                    </span>
                    <span className="lp-decisions__check">{row.isSure ? 'OK' : 'Not sure'}</span>
                  </li>
                ))}
              </ul>
              <p className="lp-decisions__verdict">
                Not sure about one answer (0.64 &lt; 0.75), so Soporti holds the approval and a person reviews it.
              </p>
            </div>
          </PreviewWindow>
        </div>

        <div className="lp-decisions__copy">
          <SectionHeading
            eyebrow="Decisions"
            title={
              <>
                Soporti makes <em>better decisions</em> with Jev.
              </>
            }
            lead="Before Soporti acts on its own, it asks Jev, TypeSafe’s question-answering model, the questions you wrote. It only goes ahead when every answer lets it."
          />
          <ul className="lp-decisions__points">
            {POINTS.map((point, index) => (
              <li
                key={point.title}
                className="lp-decisions__point lp-rise"
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
