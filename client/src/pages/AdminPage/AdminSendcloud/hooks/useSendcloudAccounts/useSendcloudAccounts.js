import { useEffect, useState } from 'react'
import { getSendcloudAccounts, isUnauthorized } from '../../../../../services/services.js'

export function useSendcloudAccounts(token, onLogout) {
  const [accounts, setAccounts] = useState(null)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const data = await getSendcloudAccounts(token)
        if (!active) return
        setAccounts(data.accounts)
        setError(null)
      } catch (err) {
        if (!active) return
        if (isUnauthorized(err)) {
          onLogout?.()
          return
        }
        setError(err.message)
      }
    }

    load()

    return () => {
      active = false
    }
  }, [token, onLogout, reloadKey])

  function reload() {
    setReloadKey(key => key + 1)
  }

  return { accounts, error, reload }
}
