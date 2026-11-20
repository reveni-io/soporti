import { useEffect, useState } from 'react'
import { onAppUpdated } from '../../pwa/service-worker.js'

export function useAppUpdate() {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false)

  useEffect(() => onAppUpdated(() => setIsUpdateAvailable(true)), [])

  function reload() {
    window.location.reload()
  }

  function dismiss() {
    setIsUpdateAvailable(false)
  }

  return { isUpdateAvailable, reload, dismiss }
}
