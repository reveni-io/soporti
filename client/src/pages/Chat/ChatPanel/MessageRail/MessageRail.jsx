import { tickOpacity, tickScale } from '../../hooks/useMessageRail/rail-geometry.js'
import './MessageRail.css'

export default function MessageRail({ items, progress, activeIndex, onSelect }) {
  if (items.length === 0) return null

  return (
    <nav className="rail" aria-label="Conversation messages">
      <ol className="rail__list">
        {items.map(item => (
          <li key={item.index}>
            <button
              type="button"
              className={buttonClass(item, activeIndex)}
              style={tickStyle(item, progress)}
              aria-label={item.label}
              aria-current={item.index === activeIndex ? 'true' : undefined}
              onClick={() => onSelect(item.index)}
            >
              <span className="rail__preview">{item.preview}</span>
              <span className="rail__tick" />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function tickStyle(item, progress) {
  const distance = Math.abs(item.index - progress)

  return { '--rail-tick-scale': tickScale(distance), '--rail-tick-opacity': tickOpacity(distance) }
}

function buttonClass(item, activeIndex) {
  const base = `rail__btn rail__btn--${item.role}`

  if (item.index !== activeIndex) return base

  return `${base} rail__btn--active`
}
