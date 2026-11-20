import { getPushRegistration, hasNotificationPermission } from './push.js'

const NOTIFICATION_ICON = '/icon-192.png'
const NOTIFICATION_BADGE = '/badge-96.png'

export async function showLocalNotification({ title, body, url, tag }) {
  if (!hasNotificationPermission()) return

  try {
    const registration = await getPushRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return

    await registration.showNotification(title, {
      body,
      tag,
      data: { url },
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
    })
  } catch {}
}
