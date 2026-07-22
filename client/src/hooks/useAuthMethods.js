import { useEffect, useState } from 'react'

// Which sign-in methods the login page should render (admin-configured).
// Returns null while loading; falls back to both-enabled if the check fails —
// the server enforces the toggles anyway, this only drives the UI.
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
