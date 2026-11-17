import { useEffect, useState } from 'react'
import { getAuthMethods } from '../../services/services.js'

const FALLBACK_METHODS = { google: true, password: true, googleScopes: null }

function parseGoogleScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) return null

  return scopes
}

export function useAuthMethods() {
  const [methods, setMethods] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await getAuthMethods()
        if (!active) return
        setMethods({
          google: Boolean(data.google),
          password: Boolean(data.password),
          googleScopes: parseGoogleScopes(data.googleScopes),
        })
      } catch {
        if (active) setMethods(FALLBACK_METHODS)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  return methods
}
