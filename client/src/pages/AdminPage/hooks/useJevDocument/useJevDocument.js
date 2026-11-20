import { useEffect, useRef, useState } from 'react'
import { getJevDocument, isUnauthorized, saveJevDocument } from '../../../../services/services.js'

const CONFLICT_STATUS = 409

function pickFields(draft, fields) {
  if (!fields) return draft

  return Object.fromEntries(fields.map(field => [field, draft[field]]))
}

export function useJevDocument(token, id, onLogout, { fields = null } = {}) {
  const [document, setDocument] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [restoredFrom, setRestoredFrom] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const loadedRef = useRef(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await getJevDocument(token, id)
        if (!active) return
        loadedRef.current = true
        setDocument(data)
        setDraft(data.data)
        setLoadError(null)
        setSaveError(null)
        setConflict(false)
        setRestoredFrom(null)
      } catch (err) {
        if (isUnauthorized(err)) {
          onLogout?.()
          return
        }
        if (!active) return
        if (loadedRef.current) setSaveError(err.message)
        else setLoadError(err.message)
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

  function restore(version, update) {
    updateDraft(update)
    setRestoredFrom(version)
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      const data = pickFields(draft, fields)
      const saved = await saveJevDocument(token, id, { rev: document.rev, data, restoredFrom })
      setDocument(saved)
      setDraft(saved.data)
      setRestoredFrom(null)
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

  return {
    document,
    draft,
    loadError,
    saveError,
    conflict,
    saving,
    savedAt,
    dirty,
    restoredFrom,
    updateDraft,
    restore,
    save,
    reload,
  }
}
