import { useEffect, useState } from 'react'

export function useAuthedResource(path, key, token, initialValue) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data[key] != null) setValue(data[key])
      } catch {}
    }
    load()
    return () => {
      cancelled = true
    }
  }, [path, key, token])

  return value
}
