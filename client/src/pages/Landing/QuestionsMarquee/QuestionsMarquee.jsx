import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import { QUESTION_ROWS } from './questions.js'
import './QuestionsMarquee.css'

const ICON_SIZE = 16
const TITLE_ID = 'lp-questions-title'

export default function QuestionsMarquee() {
  return (
    <section className="lp-questions" aria-labelledby={TITLE_ID}>
      <h2 className="lp-questions__title" id={TITLE_ID}>
        Real questions, answered from the real system
      </h2>
      {QUESTION_ROWS.map((questions, index) => (
        <MarqueeRow key={questions[0].text} questions={questions} isReversed={index % 2 === 1} />
      ))}
    </section>
  )
}

function MarqueeRow({ questions, isReversed }) {
  return (
    <div className={`lp-questions__row${isReversed ? ' lp-questions__row--reverse' : ''}`}>
      <QuestionTrack questions={questions} />
      <QuestionTrack questions={questions} isCopy />
    </div>
  )
}

function QuestionTrack({ questions, isCopy = false }) {
  return (
    <ul className="lp-questions__track" aria-hidden={isCopy ? 'true' : undefined}>
      {questions.map(question => (
        <li className="lp-questions__chip" key={question.text}>
          <IntegrationIcon id={question.icon} size={ICON_SIZE} />
          {question.text}
        </li>
      ))}
    </ul>
  )
}
