import { saveVersionProgress } from '../db/video-versions.js'

const WRITE_INTERVAL_MS = 1000
const MAX_EVENTS = 50
const MAX_TEXT_LENGTH = 300
const SECONDS_PER_MINUTE = 60

export function formatClock(seconds) {
  const whole = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(whole / SECONDS_PER_MINUTE)

  return `${minutes}:${String(whole % SECONDS_PER_MINUTE).padStart(2, '0')}`
}

function clip(text) {
  const value = String(text ?? '').trim()
  return value.length > MAX_TEXT_LENGTH ? `${value.slice(0, MAX_TEXT_LENGTH - 1)}…` : value
}

export function createProgressReporter(version, { onCancelRequested = () => {} } = {}) {
  const state = {
    pending: {},
    events: Array.isArray(version.events) ? version.events : [],
    lastWrite: 0,
    timer: null,
    writing: Promise.resolve(),
    closed: false,
  }

  async function write() {
    state.timer = null
    state.lastWrite = Date.now()
    const fields = { ...state.pending, events: state.events }
    state.pending = {}

    try {
      const saved = await saveVersionProgress(version.id, fields)
      if (saved?.cancelRequested) onCancelRequested()
    } catch (err) {
      console.error('[videos] Failed to save the progress of a video version:', version.id, err)
    }
  }

  function enqueueWrite() {
    state.writing = state.writing.then(write)
    return state.writing
  }

  function schedule() {
    if (state.closed || state.timer) return

    const wait = Math.max(0, state.lastWrite + WRITE_INTERVAL_MS - Date.now())
    state.timer = setTimeout(enqueueWrite, wait)
  }

  function update(fields) {
    Object.assign(state.pending, fields)
    schedule()
  }

  function step(text) {
    update({ step: clip(text) })
  }

  function event(text) {
    state.events = [...state.events, { at: new Date().toISOString(), text: clip(text) }].slice(-MAX_EVENTS)
    schedule()
  }

  async function close() {
    if (state.closed) return state.writing

    state.closed = true
    if (state.timer) {
      clearTimeout(state.timer)
      enqueueWrite()
    }
    return state.writing
  }

  return { update, step, event, close }
}
