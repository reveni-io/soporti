const STANDALONE_QUERY = '(display-mode: standalone)'
const IOS_DEVICE_RE = /iPad|iPhone|iPod/
const MAC_RE = /Macintosh/

const listeners = new Set()
let deferredPrompt = null
let appInstalled = false

function notifyListeners() {
  listeners.forEach(listener => listener())
}

function handleBeforeInstallPrompt(event) {
  event.preventDefault()
  deferredPrompt = event
  notifyListeners()
}

function handleAppInstalled() {
  deferredPrompt = null
  appInstalled = true
  notifyListeners()
}

export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', handleAppInstalled)
}

export function getInstallPrompt() {
  return deferredPrompt
}

export function wasAppInstalled() {
  return appInstalled
}

export function onInstallPromptChange(listener) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export async function promptInstall() {
  const prompt = deferredPrompt
  if (!prompt) return

  deferredPrompt = null
  notifyListeners()
  await prompt.prompt()
}

export function isStandalone() {
  return window.matchMedia(STANDALONE_QUERY).matches || navigator.standalone === true
}

export function isIos() {
  const userAgent = navigator.userAgent

  return IOS_DEVICE_RE.test(userAgent) || (MAC_RE.test(userAgent) && navigator.maxTouchPoints > 1)
}
