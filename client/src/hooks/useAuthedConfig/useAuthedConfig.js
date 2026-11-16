import { useCallback, useEffect, useState } from 'react'
import { isUnauthorized } from '../../services/services.js'

export function useAuthedConfig(fetchConfig, token, onLogout) {
  const [config, setConfig] = useState(null)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

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
  }, [fetchConfig, token, onLogout, reloadKey])

  const patchConfig = useCallback(patch => {
    setConfig(prev => ({ ...prev, ...patch }))
  }, [])

  function reload() {
    setReloadKey(key => key + 1)
  }

  return { config, error, patchConfig, reload }
}
