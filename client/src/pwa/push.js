import { isIos, isStandalone } from './install-prompt.js'

const GRANTED = 'granted'

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function needsHomeScreenInstall() {
  return isIos() && !isStandalone()
}

export function hasNotificationPermission() {
  return isPushSupported() && Notification.permission === GRANTED
}

export async function getPushRegistration() {
  if (!isPushSupported()) return null

  return (await navigator.serviceWorker.getRegistration()) ?? null
}

function base64UrlToBytes(value) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')

  return Uint8Array.from(atob(padded), char => char.charCodeAt(0))
}

function sameBytes(left, right) {
  return left.length === right.length && left.every((byte, index) => byte === right[index])
}

function isBoundToKey(subscription, publicKey) {
  if (!subscription.options) return true

  const boundKey = subscription.options.applicationServerKey
  if (!boundKey) return false

  return sameBytes(new Uint8Array(boundKey), base64UrlToBytes(publicKey))
}

async function activeRegistration(registration) {
  if (registration.active) return registration

  return navigator.serviceWorker.ready
}

export async function subscribeToPush(registration, publicKey) {
  const existing = await registration.pushManager.getSubscription()
  if (existing && isBoundToKey(existing, publicKey)) return existing
  if (existing) await existing.unsubscribe()

  const ready = await activeRegistration(registration)

  return ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) })
}
