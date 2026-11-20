import { useEffect, useRef, useState } from 'react'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import { getPushRegistration, isPushSupported, needsHomeScreenInstall, subscribeToPush } from '../../../../pwa/push.js'
import {
  deletePushSubscription,
  getPushPublicKey,
  isUnauthorized,
  savePushSubscription,
  sendTestPush,
} from '../../../../services/services.js'

const GRANTED = 'granted'
const DEFAULT_PERMISSION = 'default'

function currentPermission() {
  if (!isPushSupported()) return DEFAULT_PERMISSION

  return Notification.permission
}

function describeTestResult(sent) {
  if (sent === 1) return 'Test notification sent to 1 device.'

  return `Test notification sent to ${sent} devices.`
}

async function subscribeAndSave(token, registration) {
  const { publicKey } = await getPushPublicKey(token)
  const subscription = await subscribeToPush(registration, publicKey)

  await savePushSubscription(token, subscription.toJSON())
}

async function syncSubscription(token, registration) {
  const existing = await registration.pushManager.getSubscription()
  if (!existing || Notification.permission !== GRANTED) return false

  await subscribeAndSave(token, registration)

  return true
}

async function unsubscribeAndDelete(token, registration) {
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return

  await deletePushSubscription(token, subscription.endpoint)
  await subscription.unsubscribe()
}

export function usePushNotifications(token, onLogout) {
  const [isChecking, setIsChecking] = useState(isPushSupported)
  const [hasServiceWorker, setHasServiceWorker] = useState(false)
  const [permission, setPermission] = useState(currentPermission)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [syncError, setSyncError] = useState(null)
  const [testResult, setTestResult] = useState(null)
  const { saving: isBusy, error: actionError, save } = useSaveField(onLogout)
  const onLogoutRef = useRef(onLogout)
  onLogoutRef.current = onLogout

  useEffect(() => {
    if (!token || !isPushSupported()) return

    let active = true
    async function check() {
      try {
        const registration = await getPushRegistration()
        if (!active) return

        setHasServiceWorker(Boolean(registration))
        const subscribed = registration ? await syncSubscription(token, registration) : false
        if (!active) return

        setIsSubscribed(subscribed)
      } catch (err) {
        if (!active) return
        if (isUnauthorized(err)) {
          onLogoutRef.current?.()
          return
        }
        setSyncError(err.message)
      } finally {
        if (active) setIsChecking(false)
      }
    }
    check()
    return () => {
      active = false
    }
  }, [token])

  function run(perform) {
    setSyncError(null)
    setTestResult(null)

    return save(perform)
  }

  function enable() {
    return run(async () => {
      const granted = await Notification.requestPermission()
      setPermission(granted)
      if (granted !== GRANTED) return

      const registration = await getPushRegistration()
      await subscribeAndSave(token, registration)
      setIsSubscribed(true)
    })
  }

  function disable() {
    return run(async () => {
      const registration = await getPushRegistration()
      await unsubscribeAndDelete(token, registration)
      setIsSubscribed(false)
    })
  }

  function sendTest() {
    return run(async () => {
      const { sent } = await sendTestPush(token)
      setTestResult(describeTestResult(sent))
    })
  }

  return {
    isChecking,
    isSupported: hasServiceWorker,
    needsInstall: needsHomeScreenInstall(),
    permission,
    isSubscribed,
    isBusy,
    error: actionError ?? syncError,
    testResult,
    enable,
    disable,
    sendTest,
  }
}
