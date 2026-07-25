export default function SourceItem({ name, description, language, selected, onToggle, modifier }) {
  const classes = ['sidebar__source', modifier, selected ? 'sidebar__source--selected' : '']

  return (
    <li className={classes.filter(Boolean).join(' ')} onClick={onToggle}>
      <span className="sidebar__source-check">{selected ? '✓' : ''}</span>
      <div className="sidebar__source-info">
        <span className="sidebar__source-name">{name}</span>
        {language && <span className="sidebar__source-lang">{language}</span>}
        {description && <span className="sidebar__source-desc">{description}</span>}
      </div>
    </li>
  )
}
