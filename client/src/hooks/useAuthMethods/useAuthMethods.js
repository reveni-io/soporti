import { useEffect, useState } from 'react'
import { getAuthMethods } from '../../services/services.js'

export function useAuthMethods() {
  const [methods, setMethods] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await getAuthMethods()
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
