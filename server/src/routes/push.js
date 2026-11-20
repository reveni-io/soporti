import { Router } from 'express'
import { deleteUserPushSubscription, listPushSubscriptions, upsertPushSubscription } from '../db/push-subscriptions.js'
import { notifySubscriptions } from '../push/notify.js'
import { parseEndpoint, parsePushSubscription } from '../push/subscription.js'
import { getVapidPublicKey } from '../push/vapid.js'
import { CHAT_PATH } from '../constants.js'

const router = Router()

const MAX_USER_AGENT_LENGTH = 255
const TEST_NOTIFICATION = {
  title: 'Soporti',
  body: 'Notifications are working on this device.',
  url: CHAT_PATH,
  tag: 'test',
}

function parseSubscriptionBody(body) {
  return parsePushSubscription({
    endpoint: body?.endpoint,
    p256dh: body?.keys?.p256dh,
    auth: body?.keys?.auth,
  })
}

function parseUserAgent(value) {
  const userAgent = typeof value === 'string' ? value.trim().slice(0, MAX_USER_AGENT_LENGTH) : ''

  return userAgent || null
}

router.get('/key', async (_req, res) => {
  try {
    res.json({ publicKey: await getVapidPublicKey() })
  } catch (err) {
    console.error('Failed to load the push public key:', err)
    res.status(500).json({ error: 'Failed to load the push public key.' })
  }
})

router.post('/subscriptions', async (req, res) => {
  const { error, value } = parseSubscriptionBody(req.body)
  if (error) return res.status(400).json({ error })

  try {
    await upsertPushSubscription(req.user.id, { ...value, userAgent: parseUserAgent(req.get('user-agent')) })
    res.status(201).json({ saved: true })
  } catch (err) {
    console.error('Failed to save the push subscription:', err)
    res.status(500).json({ error: 'Failed to save the push subscription.' })
  }
})

router.delete('/subscriptions', async (req, res) => {
  const { error, value: endpoint } = parseEndpoint(req.body?.endpoint)
  if (error) return res.status(400).json({ error })

  try {
    await deleteUserPushSubscription(endpoint, req.user.id)
    res.status(204).end()
  } catch (err) {
    console.error('Failed to delete the push subscription:', err)
    res.status(500).json({ error: 'Failed to delete the push subscription.' })
  }
})

router.post('/test', async (req, res) => {
  try {
    const subscriptions = await listPushSubscriptions(req.user.id)
    if (subscriptions.length === 0) {
      return res.status(404).json({ error: 'No device is subscribed to notifications.' })
    }

    res.json({ sent: await notifySubscriptions(subscriptions, TEST_NOTIFICATION) })
  } catch (err) {
    console.error('Failed to send the test notification:', err)
    res.status(500).json({ error: 'Failed to send the test notification.' })
  }
})

export default router
