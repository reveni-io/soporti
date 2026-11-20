import Icon from '../../../common/Icon/Icon.jsx'
import { staggerStyle } from '../stagger.js'
import './HighlightsGrid.css'

const ICON_SIZE = 18
const FIRST_INDEX = 6

const HIGHLIGHTS = [
  {
    icon: 'users',
    title: 'Support or Tech',
    text: 'Plain-language answers for support, file-and-line detail for engineers.',
  },
  {
    icon: 'paperclip',
    title: 'Files and screenshots',
    text: 'Drop a PDF, a spreadsheet or a CSV, or paste a screenshot straight in.',
  },
  {
    icon: 'settings',
    title: 'Pick the sources',
    text: 'Scope a chat to some repos and tools, or let YOLO choose for you.',
  },
  {
    icon: 'spark',
    title: 'Your model, your keys',
    text: 'OpenAI or Anthropic, switched from /admin with no redeploy.',
  },
  {
    icon: 'zap',
    title: 'Several chats at once',
    text: 'Ask the next question while the last answer is still arriving.',
  },
  {
    icon: 'check',
    title: 'Learns from a 👍',
    text: 'A good answer becomes a solved case that later questions reuse.',
  },
  {
    icon: 'share',
    title: 'Read-only share links',
    text: 'Hand a frozen thread to anyone, no account needed.',
  },
  {
    icon: 'help-circle',
    title: 'Let Me Soporti That For You',
    text: 'Send a link that types the question into Soporti for them.',
  },
]

export default function HighlightsGrid() {
  return (
    <ul className="lp-highlights" aria-label="Everyday details">
      {HIGHLIGHTS.map((highlight, index) => (
        <li key={highlight.title} className="lp-highlights__item lp-rise" style={staggerStyle(FIRST_INDEX + index)}>
          <span className="lp-icon-tile lp-highlights__icon">
            <Icon name={highlight.icon} size={ICON_SIZE} />
          </span>
          <span className="lp-highlights__title">{highlight.title}</span>
          <span className="lp-highlights__text">{highlight.text}</span>
        </li>
      ))}
    </ul>
  )
}
