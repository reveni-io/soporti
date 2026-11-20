import { and, desc, eq, inArray } from 'drizzle-orm'
import { getDb } from './index.js'
import { pushSubscriptions } from './schema.js'

const MAX_SUBSCRIPTIONS_PER_USER = 20

async function pruneOldSubscriptions(userId) {
  const stale = await getDb()
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.updatedAt))
    .offset(MAX_SUBSCRIPTIONS_PER_USER)
  if (stale.length === 0) return

  await getDb()
    .delete(pushSubscriptions)
    .where(
      inArray(
        pushSubscriptions.id,
        stale.map(row => row.id)
      )
    )
}

export async function upsertPushSubscription(userId, { endpoint, p256dh, auth, userAgent }) {
  const updatedAt = new Date()

  await getDb()
    .insert(pushSubscriptions)
    .values({ userId, endpoint, p256dh, auth, userAgent, updatedAt })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh, auth, userAgent, updatedAt },
    })
  await pruneOldSubscriptions(userId)
}

export async function listPushSubscriptions(userId) {
  return getDb()
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
}

export async function deleteUserPushSubscription(endpoint, userId) {
  await getDb()
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
}

export async function deletePushSubscription(endpoint) {
  await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
}

export async function deleteAllPushSubscriptions() {
  await getDb().delete(pushSubscriptions)
}
