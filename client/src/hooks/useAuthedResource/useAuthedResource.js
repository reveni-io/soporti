import { useEffect, useState } from 'react'

export function useAuthedResource(fetchResource, key, token, initialValue, reloadKey = 0) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    if (!token) return

    let cancelled = false
    async function load() {
      try {
        const data = await fetchResource(token)
        if (!cancelled && data[key] != null) setValue(data[key])
      } catch {}
    }
    load()
    return () => {
      cancelled = true
    }
  }, [fetchResource, key, token, reloadKey])

  return value
}
