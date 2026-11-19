import { useEffect, useState } from 'react'
import { getJevDocument, isUnauthorized, saveJevDocument } from '../../../../services/services.js'

const CONFLICT_STATUS = 409

export function useJevDocument(token, id, onLogout) {
  const [document, setDocument] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await getJevDocument(token, id)
        if (!active) return
        setDocument(data)
        setDraft(data.data)
        setSaveError(null)
        setConflict(false)
      } catch (err) {
        if (isUnauthorized(err)) {
          onLogout?.()
          return
        }
        if (active) setLoadError(err.message)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [token, id, onLogout, reloadKey])

  function updateDraft(update) {
    setDraft(update)
    setSavedAt(null)
    if (!conflict) setSaveError(null)
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await saveJevDocument(token, id, { rev: document.rev, data: draft })
      setDocument(saved)
      setDraft(saved.data)
      setConflict(false)
      setSavedAt(Date.now())
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout?.()
        return
      }
      setConflict(err.status === CONFLICT_STATUS)
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function reload() {
    setReloadKey(key => key + 1)
  }

  const dirty = Boolean(document) && JSON.stringify(document.data) !== JSON.stringify(draft)

  return { document, draft, loadError, saveError, conflict, saving, savedAt, dirty, updateDraft, save, reload }
}
