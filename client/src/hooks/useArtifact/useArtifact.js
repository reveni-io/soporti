import { useEffect, useRef, useState } from 'react'
import { deleteArtifactVersion, getArtifact, getArtifactHtml, isUnauthorized } from '../../services/services.js'

export function useArtifact(token, id, onAuthError, openedVersion = null) {
  const [picked, setPicked] = useState(null)
  const [artifact, setArtifact] = useState(null)
  const [html, setHtml] = useState('')
  const [loadedVersion, setLoadedVersion] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const onAuthErrorRef = useRef(onAuthError)
  onAuthErrorRef.current = onAuthError

  const isPickCurrent = picked !== null && picked.id === id && picked.openedVersion === openedVersion
  const requestedVersion = (isPickCurrent ? picked.version : null) ?? openedVersion

  function selectVersion(nextVersion) {
    setPicked({ id, openedVersion, version: nextVersion })
  }

  async function removeVersion(version) {
    setDeleteError('')

    try {
      const data = await deleteArtifactVersion(token, id, version)
      setArtifact(prev => (prev ? { ...prev, versions: (prev.versions ?? []).filter(v => v !== version) } : prev))
      selectVersion(data.latestVersion)
    } catch (err) {
      if (isUnauthorized(err)) {
        onAuthErrorRef.current?.()
        return
      }
      setDeleteError(err.message)
    }
  }

  useEffect(() => {
    setArtifact(null)
    setHtml('')
    setLoadedVersion(null)
    setDeleteError('')
  }, [id])

  useEffect(() => {
    if (!token || !id) return

    let active = true

    async function load() {
      try {
        const data = await getArtifact(token, id)
        if (active) setArtifact(data.artifact)
      } catch (err) {
        if (isUnauthorized(err)) onAuthErrorRef.current?.()
      }
    }

    load()

    return () => {
      active = false
    }
  }, [token, id, openedVersion])

  useEffect(() => {
    if (!token || !id) return

    let active = true
    setLoading(true)
    setError('')

    async function load() {
      try {
        const data = await getArtifactHtml(token, id, requestedVersion)
        if (!active) return
        setHtml(data.html)
        setLoadedVersion(data.version)
      } catch (err) {
        if (isUnauthorized(err)) {
          onAuthErrorRef.current?.()
          return
        }
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()

    return () => {
      active = false
    }
  }, [token, id, requestedVersion])

  return {
    artifact,
    html,
    version: requestedVersion ?? loadedVersion,
    loading,
    error,
    deleteError,
    selectVersion,
    removeVersion,
  }
}
