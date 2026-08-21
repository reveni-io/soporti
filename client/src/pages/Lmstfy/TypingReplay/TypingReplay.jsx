import Icon from '../../../common/Icon/Icon.jsx'
import ChatPreview from './ChatPreview/ChatPreview.jsx'
import {
  useTypingReplay,
  ADDRESS_PHASE,
  URL_PHASE,
  LOADING_PHASE,
  COMPOSER_PHASE,
  QUESTION_PHASE,
  SEND_PHASE,
  PRESSING_PHASE,
  DONE_PHASE,
} from '../hooks/useTypingReplay/useTypingReplay.js'
import './TypingReplay.css'

const CURSOR_SIZE = 20

const CURSOR_TARGETS = {
  [ADDRESS_PHASE]: 'address',
  [URL_PHASE]: 'address',
  [LOADING_PHASE]: 'address',
  [COMPOSER_PHASE]: 'composer',
  [QUESTION_PHASE]: 'composer',
  [SEND_PHASE]: 'send',
  [PRESSING_PHASE]: 'send',
  [DONE_PHASE]: 'send',
}

const LOADED_PHASES = [COMPOSER_PHASE, QUESTION_PHASE, SEND_PHASE, PRESSING_PHASE, DONE_PHASE]

export default function TypingReplay({ question }) {
  const { phase, typedUrl, typedQuestion, isClicking } = useTypingReplay(question)

  const cursorTarget = CURSOR_TARGETS[phase]
  const cursorClass = [
    'lmstfy-replay__cursor',
    cursorTarget && `lmstfy-replay__cursor--${cursorTarget}`,
    isClicking && 'lmstfy-replay__cursor--clicking',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="lmstfy-replay">
      <p className="lmstfy-replay__lead">Here is how you could have asked Soporti.</p>

      <div className="lmstfy-replay__window">
        <div className="lmstfy-replay__chrome">
          <span className="lmstfy-replay__dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span
            className={`lmstfy-replay__address${phase === URL_PHASE ? ' lmstfy-replay__address--focused' : ''}`}
            data-testid="replay-address"
          >
            {typedUrl}
            {phase === URL_PHASE && <span className="lmstfy-caret" aria-hidden="true" />}
          </span>
        </div>

        <div className="lmstfy-replay__viewport">
          {phase === LOADING_PHASE && <span className="lmstfy-replay__progress" data-testid="replay-progress" />}
          {LOADED_PHASES.includes(phase) && (
            <ChatPreview
              question={typedQuestion}
              isComposerActive={phase === QUESTION_PHASE}
              isSendPressed={phase === PRESSING_PHASE || phase === DONE_PHASE}
            />
          )}
        </div>

        <span className={cursorClass} data-testid="replay-cursor">
          <Icon name="cursor" size={CURSOR_SIZE} />
        </span>
      </div>

      {phase === DONE_PHASE && <p className="lmstfy-replay__hint">Taking you there. Next time, ask it yourself.</p>}
    </div>
  )
}
