const SERVICE_WORKER_URL = '/sw.js'
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

const appUpdatedListeners = new Set()

export function onAppUpdated(listener) {
  appUpdatedListeners.add(listener)

  return () => {
    appUpdatedListeners.delete(listener)
  }
}

function notifyAppUpdated() {
  appUpdatedListeners.forEach(listener => listener())
}

function watchControllerChanges(container) {
  let isControlled = Boolean(container.controller)

  container.addEventListener('controllerchange', () => {
    if (isControlled) notifyAppUpdated()
    isControlled = true
  })
}

function checkForUpdate(registration) {
  registration.update().catch(() => {})
}

function watchForUpdates(registration) {
  setInterval(() => checkForUpdate(registration), UPDATE_CHECK_INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate(registration)
  })
}

export async function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  watchControllerChanges(navigator.serviceWorker)

  try {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL)
    watchForUpdates(registration)
  } catch {}
}
