import { useEffect, useState } from 'react'

export function useAuthMethods() {
  const [methods, setMethods] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/methods`)
        if (!res.ok) throw new Error('unavailable')
        const data = await res.json()
        if (active) setMethods({ google: Boolean(data.google), password: Boolean(data.password) })
      } catch {
        if (active) setMethods({ google: true, password: true })
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  return methods
}
