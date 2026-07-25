import { useState } from 'react'
import { isUnauthorized } from '../../services/services.js'

export function useSaveField(onLogout) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  async function save(perform) {
    setSaving(true)
    setError(null)
    try {
      await perform()
      setSavedAt(Date.now())
      return true
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout?.()
        return false
      }
      setError(err.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  return { saving, error, savedAt, save }
}
