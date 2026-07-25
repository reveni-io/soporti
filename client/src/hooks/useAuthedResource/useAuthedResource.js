import { useEffect, useState } from 'react'

export function useAuthedResource(fetchResource, key, token, initialValue) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
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
  }, [fetchResource, key, token])

  return value
}
