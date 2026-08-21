import './ChatPreview.css'

const SOURCES = ['github', 'notion', 'sentry', 'database']
const SEND_GLYPH = '↑'

export default function ChatPreview({ question, isComposerActive, isSendPressed }) {
  return (
    <div className="chat-preview">
      <aside className="chat-preview__sidebar">
        <span className="chat-preview__brand">Soporti</span>
        <span className="chat-preview__source chat-preview__source--selected">YOLO</span>
        {SOURCES.map(source => (
          <span key={source} className="chat-preview__source">
            {source}
          </span>
        ))}
      </aside>

      <div className="chat-preview__main">
        <div className="chat-preview__empty">
          <span className="chat-preview__title">Ask Soporti anything</span>
          <span className="chat-preview__lead">Code, data, docs, tickets and errors, from the connected tools.</span>
        </div>

        <div className={`chat-preview__composer${isComposerActive ? ' chat-preview__composer--active' : ''}`}>
          <span className={`chat-preview__text${question ? '' : ' chat-preview__text--placeholder'}`}>
            {question || 'Ask Soporti anything...'}
            {isComposerActive && <span className="lmstfy-caret" aria-hidden="true" />}
          </span>
          <span
            className={`chat-preview__send${isSendPressed ? ' chat-preview__send--pressed' : ''}`}
            aria-hidden="true"
          >
            {SEND_GLYPH}
          </span>
        </div>
      </div>
    </div>
  )
}
