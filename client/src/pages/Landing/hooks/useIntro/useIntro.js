import { useEffect, useState } from 'react'

export const INTRO_PHASES = { PLAYING: 'playing', LEAVING: 'leaving', DONE: 'done' }

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const SEEN_KEY = 'soporti_landing_intro_seen'
const SEEN_VALUE = '1'
const HOLD_MS = 2300
const EXIT_MS = 1100
const SKIP_EVENTS = ['keydown', 'wheel', 'touchstart']

function hasSeenIntro() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === SEEN_VALUE
  } catch {
    return false
  }
}

function rememberIntro() {
  try {
    sessionStorage.setItem(SEEN_KEY, SEEN_VALUE)
  } catch {}
}

function initialPhase() {
  if (window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches || hasSeenIntro()) return INTRO_PHASES.DONE

  return INTRO_PHASES.PLAYING
}

function leavePlaying(current) {
  return current === INTRO_PHASES.PLAYING ? INTRO_PHASES.LEAVING : current
}

export function useIntro() {
  const [phase, setPhase] = useState(initialPhase)

  useEffect(() => {
    if (phase !== INTRO_PHASES.PLAYING) return

    function handleSkip() {
      setPhase(leavePlaying)
    }

    const timer = setTimeout(handleSkip, HOLD_MS)
    SKIP_EVENTS.forEach(type => window.addEventListener(type, handleSkip, { passive: true }))

    return () => {
      clearTimeout(timer)
      SKIP_EVENTS.forEach(type => window.removeEventListener(type, handleSkip))
    }
  }, [phase])

  useEffect(() => {
    if (phase !== INTRO_PHASES.LEAVING) return

    rememberIntro()
    const timer = setTimeout(() => setPhase(INTRO_PHASES.DONE), EXIT_MS)

    return () => clearTimeout(timer)
  }, [phase])

  function skip() {
    setPhase(leavePlaying)
  }

  return { phase, skip }
}
