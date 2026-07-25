import { useCallback, useEffect, useState } from 'react'
import { isUnauthorized } from '../../services/services.js'

export function useAuthedConfig(fetchConfig, token, onLogout) {
  const [config, setConfig] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await fetchConfig(token)
        if (active) setConfig(data)
      } catch (err) {
        if (isUnauthorized(err)) {
          onLogout?.()
          return
        }
        if (active) setError(err.message)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [fetchConfig, token, onLogout])

  const patchConfig = useCallback(patch => {
    setConfig(prev => ({ ...prev, ...patch }))
  }, [])

  return { config, error, patchConfig }
}
