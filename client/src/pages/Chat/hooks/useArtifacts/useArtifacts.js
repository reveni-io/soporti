import { useCallback, useState } from 'react'
import { useArtifact } from '../../../../hooks/useArtifact/useArtifact.js'

export function useArtifacts(token, onAuthError) {
  const [open, setOpen] = useState(null)

  const openArtifact = useCallback(artifactId => setOpen({ id: artifactId, version: null }), [])

  const openPublished = useCallback(published => setOpen({ id: published.artifactId, version: published.version }), [])

  const close = useCallback(() => setOpen(null), [])

  const loaded = useArtifact(token, open?.id ?? null, onAuthError, open?.version ?? null)

  return { openId: open?.id ?? null, openArtifact, openPublished, close, ...loaded }
}
