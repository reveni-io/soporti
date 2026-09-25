import { useAuthedConfig } from '../../../../hooks/useAuthedConfig/useAuthedConfig.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import {
  connectZendesk,
  disconnectZendesk,
  getZendeskConnection,
  saveZendeskView,
  saveZendeskWrites,
} from '../../../../services/services.js'

export function useZendeskConnection(token, onLogout, onConnectionsChange) {
  const { config, error: loadError, patchConfig } = useAuthedConfig(getZendeskConnection, token, onLogout)
  const { saving, error: saveError, save } = useSaveField(onLogout)

  async function apply(perform, { changesSources = false } = {}) {
    const saved = await save(async () => {
      const data = await perform()
      patchConfig(data)
    })
    if (saved && changesSources) onConnectionsChange?.()

    return saved
  }

  function connect(credentials) {
    return apply(() => connectZendesk(token, credentials), { changesSources: true })
  }

  function disconnect() {
    return apply(() => disconnectZendesk(token), { changesSources: true })
  }

  function saveView(viewId) {
    return apply(() => saveZendeskView(token, viewId))
  }

  function saveWrites(enabled) {
    return apply(() => saveZendeskWrites(token, enabled))
  }

  return { connection: config, loadError, saving, saveError, connect, disconnect, saveView, saveWrites }
}
