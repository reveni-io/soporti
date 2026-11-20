import { useSyncExternalStore } from 'react'
import { THEME } from '../../constants.js'

const THEME_ATTRIBUTE = 'data-theme'
const SWITCHING_ATTRIBUTE = 'data-theme-switching'
const THEME_STORAGE_KEY = 'soporti_theme'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const REVEAL_X = '--theme-reveal-x'
const REVEAL_Y = '--theme-reveal-y'
const REVEAL_RADIUS = '--theme-reveal-radius'

function subscribe(onChange) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributeFilter: [THEME_ATTRIBUTE] })

  return () => observer.disconnect()
}

function readTheme() {
  return document.documentElement.getAttribute(THEME_ATTRIBUTE) === THEME.DARK ? THEME.DARK : THEME.LIGHT
}

function applyTheme(theme) {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme)
}

function canReveal() {
  return Boolean(document.startViewTransition) && !window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function revealRadius({ x, y }) {
  return Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
}

function revealTheme(theme, origin) {
  const root = document.documentElement

  root.style.setProperty(REVEAL_X, `${origin.x}px`)
  root.style.setProperty(REVEAL_Y, `${origin.y}px`)
  root.style.setProperty(REVEAL_RADIUS, `${revealRadius(origin)}px`)
  root.setAttribute(SWITCHING_ATTRIBUTE, '')

  const transition = document.startViewTransition(() => applyTheme(theme))
  transition.finished.finally(() => root.removeAttribute(SWITCHING_ATTRIBUTE))
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme)

  function toggleTheme(origin) {
    const nextTheme = theme === THEME.DARK ? THEME.LIGHT : THEME.DARK

    localStorage.setItem(THEME_STORAGE_KEY, nextTheme)

    if (!canReveal()) {
      applyTheme(nextTheme)
      return
    }

    revealTheme(nextTheme, origin)
  }

  return { theme, toggleTheme }
}
