import Icon from '../../../../../common/Icon/Icon.jsx'
import './SourceItem.css'

const CHECK_ICON_SIZE = 10
const CHECK_ICON_STROKE = 3.5

export default function SourceItem({ name, description, language, icon, selected, onToggle, modifier }) {
  const classes = ['source-item', modifier, selected && 'source-item--selected'].filter(Boolean).join(' ')

  return (
    <li>
      <button type="button" className={classes} aria-pressed={selected} onClick={onToggle}>
        <span className="source-item__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="source-item__info">
          <span className="source-item__name">{name}</span>
          {(language || description) && (
            <span className="source-item__meta">
              {language && <span className="source-item__lang">{language}</span>}
              {description && <span className="source-item__desc">{description}</span>}
            </span>
          )}
        </span>
        <span className="source-item__check" aria-hidden="true">
          <Icon
            name="check"
            size={CHECK_ICON_SIZE}
            strokeWidth={CHECK_ICON_STROKE}
            className="source-item__check-icon"
          />
        </span>
      </button>
    </li>
  )
}
