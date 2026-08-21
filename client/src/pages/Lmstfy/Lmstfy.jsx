import { useSearchParams } from 'react-router-dom'
import GridPattern from '../../common/GridPattern/GridPattern.jsx'
import { QUESTION_PARAM } from '../../constants.js'
import QuestionForm from './QuestionForm/QuestionForm.jsx'
import TypingReplay from './TypingReplay/TypingReplay.jsx'
import './Lmstfy.css'

export default function Lmstfy() {
  const [searchParams] = useSearchParams()
  const question = searchParams.get(QUESTION_PARAM)?.trim() ?? ''

  return (
    <div className="lmstfy">
      <header className="lmstfy__header">
        <span className="lmstfy__brand">Soporti</span>
        <span className="badge">LMSTFY</span>
      </header>

      <main className="lmstfy__body">
        <GridPattern variant="light" />
        <div className="lmstfy__panel">{question ? <TypingReplay question={question} /> : <QuestionForm />}</div>
      </main>
    </div>
  )
}
