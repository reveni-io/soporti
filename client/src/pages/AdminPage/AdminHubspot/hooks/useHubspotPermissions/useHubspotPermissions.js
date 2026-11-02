import { useState } from 'react'
import { saveHubspotPermissions } from '../../../../../services/services.js'
import { useSaveField } from '../../../../../hooks/useSaveField/useSaveField.js'

const CONVERSATIONS_AREA = 'conversations'
const REPLY_LEVEL = 'reply'
const FULL_LEVEL = 'full'

function scopesFor({ areas, requiredScopes }, draft) {
  const areaScopes = new Set(areas.flatMap(area => Object.values(area.scopes).flat()))
  const baseScopes = requiredScopes.filter(scope => !areaScopes.has(scope))
  const draftScopes = areas.flatMap(area => area.scopes[draft[area.id]])

  return [...new Set([...baseScopes, ...draftScopes])].sort()
}

export function useHubspotPermissions({ token, config, onLogout, onSaved }) {
  const [edits, setEdits] = useState({})
  const { saving, error, savedAt, save } = useSaveField(onLogout)

  const draft = { ...config.permissions, ...edits }

  function setLevel(areaId, level) {
    setEdits(prev => ({ ...prev, [areaId]: level }))
  }

  function submit() {
    return save(async () => {
      const data = await saveHubspotPermissions(token, draft)
      onSaved({ permissions: data.permissions, requiredScopes: data.requiredScopes })
      setEdits({})
    })
  }

  return {
    draft,
    scopes: scopesFor(config, draft),
    dirty: config.areas.some(area => draft[area.id] !== config.permissions[area.id]),
    repliesEnabled: draft[CONVERSATIONS_AREA] === REPLY_LEVEL,
    fullEnabled: Object.values(draft).includes(FULL_LEVEL),
    saving,
    error,
    savedAt,
    setLevel,
    submit,
  }
}
