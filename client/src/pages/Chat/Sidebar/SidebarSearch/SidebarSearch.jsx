import Icon from '../../../../common/Icon/Icon.jsx'
import './SidebarSearch.css'

const SEARCH_ICON_SIZE = 14
const CLEAR_ICON_SIZE = 12

export default function SidebarSearch({ value, label, placeholder, maxLength, onChange }) {
  function handleKeyDown(event) {
    if (event.key === 'Escape') onChange('')
  }

  return (
    <div className="sidebar-search">
      <Icon name="search" size={SEARCH_ICON_SIZE} className="sidebar-search__icon" />
      <input
        type="text"
        className="sidebar-search__input"
        placeholder={placeholder}
        aria-label={label}
        maxLength={maxLength}
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {value && (
        <button type="button" className="sidebar-search__clear" onClick={() => onChange('')} aria-label="Clear search">
          <Icon name="close" size={CLEAR_ICON_SIZE} />
        </button>
      )}
    </div>
  )
}
