import { useAuthedConfig } from '../../../../hooks/useAuthedConfig/useAuthedConfig.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import { connectGoogle, disconnectGoogle, getGoogleConnection } from '../../../../services/services.js'

const ACCESS_NOT_GRANTED = 'Google did not grant access. Try again and allow Gmail and Calendar.'

export function useGoogleConnection(token, onLogout, onConnectionsChange) {
  const { config, error: loadError, patchConfig } = useAuthedConfig(getGoogleConnection, token, onLogout)
  const { saving, error: saveError, save } = useSaveField(onLogout)

  async function apply(perform) {
    const saved = await save(async () => {
      const data = await perform()
      patchConfig(data)
    })
    if (saved) onConnectionsChange?.()

    return saved
  }

  function connect(code) {
    return apply(async () => {
      if (!code) throw new Error(ACCESS_NOT_GRANTED)

      return connectGoogle(token, code)
    })
  }

  function disconnect() {
    return apply(() => disconnectGoogle(token))
  }

  return { connection: config, loadError, saving, saveError, connect, disconnect }
}
