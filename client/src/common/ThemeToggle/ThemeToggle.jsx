import Icon from '../Icon/Icon.jsx'
import { useTheme } from '../../hooks/useTheme/useTheme.js'
import { THEME } from '../../constants.js'
import './ThemeToggle.css'

const ICON_SIZE = 16
const LABELS = {
  [THEME.LIGHT]: 'Switch to dark theme',
  [THEME.DARK]: 'Switch to light theme',
}

function centerOf(element) {
  const rect = element.getBoundingClientRect()

  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme()
  const label = LABELS[theme]

  function handleClick(event) {
    toggleTheme(centerOf(event.currentTarget))
  }

  return (
    <button
      type="button"
      className={`icon-btn theme-toggle theme-toggle--${theme} ${className}`}
      onClick={handleClick}
      aria-label={label}
      title={label}
    >
      <Icon name="sun" size={ICON_SIZE} className="theme-toggle__icon theme-toggle__icon--sun" />
      <Icon name="moon" size={ICON_SIZE} className="theme-toggle__icon theme-toggle__icon--moon" />
    </button>
  )
}
