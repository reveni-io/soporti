import { CodeChangeSession } from './session.js'

const SESSION_IDLE_MS = 60 * 60_000
const CLEANUP_INTERVAL_MS = 5 * 60_000

const sessions = new Map()
let cleanupTimer = null

function discardSession(key, session) {
  sessions.delete(key)
  session.dispose().catch(err => console.error('Failed to release an expired code change session:', err))
}

function stopCleanupTimer() {
  clearInterval(cleanupTimer)
  cleanupTimer = null
}

function sweepIdleSessions() {
  const now = Date.now()

  for (const [key, session] of sessions) {
    if (session.isIdle(now, SESSION_IDLE_MS)) discardSession(key, session)
  }

  if (sessions.size === 0) stopCleanupTimer()
}

function startCleanupTimer() {
  if (cleanupTimer) return

  cleanupTimer = setInterval(sweepIdleSessions, CLEANUP_INTERVAL_MS)
  cleanupTimer.unref()
}

export function getCodeChangeSession(key) {
  if (key === undefined || key === null || key === '') throw new Error('A code change session needs a key.')

  const existing = sessions.get(key)
  if (existing && !existing.isIdle(Date.now(), SESSION_IDLE_MS)) {
    existing.touch()
    return existing
  }

  if (existing) discardSession(key, existing)

  const session = new CodeChangeSession()
  sessions.set(key, session)
  startCleanupTimer()

  return session
}

export async function _resetCodeChangeSessionsForTests() {
  const all = [...sessions.values()]

  sessions.clear()
  stopCleanupTimer()

  await Promise.all(all.map(session => session.dispose()))
}
