import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const NAVIGATE_MESSAGE = 'soporti:navigate'
const APP_PATH_RE = /^\/(?!\/)/

function readNavigationPath(data) {
  if (data?.type !== NAVIGATE_MESSAGE) return null
  if (typeof data.url !== 'string' || !APP_PATH_RE.test(data.url)) return null

  return data.url
}

export function useServiceWorkerNavigation() {
  const navigate = useNavigate()

  useEffect(() => {
    const container = navigator.serviceWorker
    if (!container) return

    function handleMessage(event) {
      const path = readNavigationPath(event.data)
      if (path) navigate(path)
    }

    container.addEventListener('message', handleMessage)
    return () => container.removeEventListener('message', handleMessage)
  }, [navigate])
}
