import { Link, useSearchParams } from 'react-router-dom'
import GridPattern from '../../common/GridPattern/GridPattern.jsx'
import Icon from '../../common/Icon/Icon.jsx'
import { QUESTION_PARAM } from '../../constants.js'
import { readStoredToken } from '../../context/AuthContext.jsx'
import { ROUTES } from '../../router/constants.js'
import QuestionForm from './QuestionForm/QuestionForm.jsx'
import TypingReplay from './TypingReplay/TypingReplay.jsx'
import './Lmstfy.css'

const BACK_ICON_SIZE = 18

export default function Lmstfy() {
  const [searchParams] = useSearchParams()
  const question = searchParams.get(QUESTION_PARAM)?.trim() ?? ''
  const isLoggedIn = Boolean(readStoredToken())

  return (
    <div className="lmstfy">
      <header className="lmstfy__header">
        {isLoggedIn && (
          <Link className="icon-btn lmstfy__back" to={ROUTES.CHAT} aria-label="Back to chat">
            <Icon name="arrow-left" size={BACK_ICON_SIZE} />
          </Link>
        )}
        <span className="lmstfy__brand">Soporti</span>
        <span className="badge">LMSTFY</span>
      </header>

      <main className="lmstfy__body">
        <GridPattern variant="surface" />
        <div className="lmstfy__panel">{question ? <TypingReplay question={question} /> : <QuestionForm />}</div>
      </main>
    </div>
  )
}
