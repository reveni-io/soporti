const turns = new Map()

function turnKey(requestId, userId) {
  return `${userId}:${requestId}`
}

export function trackTurn(requestId, userId) {
  if (!requestId) return null

  const key = turnKey(requestId, userId)
  turns.set(key, false)

  return key
}

export function stopTurn(requestId, userId) {
  const key = turnKey(requestId, userId)
  if (!turns.has(key)) return false

  turns.set(key, true)

  return true
}

export function isTurnStopped(key) {
  return turns.get(key) === true
}

export function releaseTurn(key) {
  if (!key) return

  turns.delete(key)
}

export function _countTrackedTurnsForTests() {
  return turns.size
}
