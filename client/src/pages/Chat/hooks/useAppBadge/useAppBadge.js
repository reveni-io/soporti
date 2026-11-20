import { useEffect } from 'react'

function syncAppBadge(count) {
  if (count > 0) return navigator.setAppBadge(count)

  return navigator.clearAppBadge()
}

export function useAppBadge(count) {
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return

    syncAppBadge(count).catch(() => {})
  }, [count])
}
