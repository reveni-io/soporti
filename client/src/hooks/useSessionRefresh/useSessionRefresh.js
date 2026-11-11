import { useEffect } from 'react'
import { isUnauthorized, refreshSession } from '../../services/services.js'

const CHECK_INTERVAL_MS = 60 * 60 * 1000
const MS_PER_SECOND = 1000

function readClaims(token) {
  try {
    const payload = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')
    return JSON.parse(atob(payload))
  } catch {
    return null
  }
}

function isPastHalfLife(token) {
  const claims = readClaims(token)

  if (!Number.isFinite(claims?.iat) || !Number.isFinite(claims?.exp)) return false

  const halfLifeSeconds = (claims.iat + claims.exp) / 2

  return Date.now() / MS_PER_SECOND >= halfLifeSeconds
}

export function useSessionRefresh(token, { onRefresh, onExpire }) {
  useEffect(() => {
    if (!token) return undefined

    let active = true

    async function refreshWhenStale() {
      if (!isPastHalfLife(token)) return

      try {
        const session = await refreshSession(token)
        if (active) onRefresh(session)
      } catch (err) {
        if (active && isUnauthorized(err)) onExpire()
      }
    }

    refreshWhenStale()
    const interval = setInterval(refreshWhenStale, CHECK_INTERVAL_MS)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [token, onRefresh, onExpire])
}
