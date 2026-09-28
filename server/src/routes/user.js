import { Router } from 'express'
import { getCustomInstructions, updateCustomInstructions } from '../db/users.js'
import { isGranolaConfigured, setGranolaApiKey } from '../granola/settings.js'
import {
  INVALID_ZENDESK_CONNECTION,
  connectZendesk,
  describeZendeskConnection,
  disconnectZendesk,
  getZendeskConnection,
  setZendeskWrites,
} from '../zendesk/settings.js'
import { MAX_INSTRUCTIONS_LENGTH } from '../constants.js'

const router = Router()

const ZENDESK_NOT_CONNECTED_ERROR = 'Zendesk is not connected.'

router.get('/instructions', async (req, res) => {
  try {
    const instructions = await getCustomInstructions(req.user.id)
    res.json({ instructions: instructions ?? '' })
  } catch (err) {
    console.error('Failed to load custom instructions:', err)
    res.status(500).json({ error: 'Failed to load instructions.' })
  }
})

router.put('/instructions', async (req, res) => {
  const { instructions } = req.body ?? {}

  if (instructions != null && typeof instructions !== 'string') {
    return res.status(400).json({ error: '"instructions" must be a string.' })
  }
  if (typeof instructions === 'string' && instructions.length > MAX_INSTRUCTIONS_LENGTH) {
    return res.status(400).json({ error: `Instructions are too long (max ${MAX_INSTRUCTIONS_LENGTH} characters).` })
  }

  try {
    const saved = await updateCustomInstructions(req.user.id, instructions ?? '')
    res.json({ instructions: saved ?? '' })
  } catch (err) {
    console.error('Failed to save custom instructions:', err)
    res.status(500).json({ error: 'Failed to save instructions.' })
  }
})

router.get('/granola', async (req, res) => {
  try {
    const connected = await isGranolaConfigured(req.user.id)
    res.json({ connected })
  } catch (err) {
    console.error('Failed to load the Granola connection:', err)
    res.status(500).json({ error: 'Failed to load the Granola connection.' })
  }
})

router.put('/granola', async (req, res) => {
  const { apiKey } = req.body ?? {}

  if (apiKey != null && typeof apiKey !== 'string') {
    return res.status(400).json({ error: '"apiKey" must be a string.' })
  }

  try {
    const saved = await setGranolaApiKey(req.user.id, apiKey ?? '')
    res.json({ connected: Boolean(saved) })
  } catch (err) {
    if (err.code === 'INVALID_GRANOLA_API_KEY') {
      return res.status(400).json({ error: err.message })
    }
    console.error('Failed to save the Granola API key:', err)
    res.status(500).json({ error: 'Failed to save the Granola API key.' })
  }
})

router.get('/zendesk', async (req, res) => {
  try {
    const connection = await getZendeskConnection(req.user.id)
    res.json(describeZendeskConnection(connection))
  } catch (err) {
    console.error('Failed to load the Zendesk connection:', err)
    res.status(500).json({ error: 'Failed to load the Zendesk connection.' })
  }
})

router.put('/zendesk', async (req, res) => {
  try {
    const connection = await connectZendesk(req.user.id, req.body ?? {})
    res.json(describeZendeskConnection(connection))
  } catch (err) {
    if (err.code === INVALID_ZENDESK_CONNECTION) return res.status(400).json({ error: err.message })

    console.error('Failed to save the Zendesk connection:', err)
    res.status(500).json({ error: 'Failed to save the Zendesk connection.' })
  }
})

router.delete('/zendesk', async (req, res) => {
  try {
    await disconnectZendesk(req.user.id)
    res.json(describeZendeskConnection(null))
  } catch (err) {
    console.error('Failed to disconnect Zendesk:', err)
    res.status(500).json({ error: 'Failed to disconnect Zendesk.' })
  }
})

router.put('/zendesk/writes', async (req, res) => {
  const { enabled } = req.body ?? {}

  if (typeof enabled !== 'boolean') return res.status(400).json({ error: '"enabled" must be a boolean.' })

  try {
    const connection = await setZendeskWrites(req.user.id, enabled)
    if (!connection) return res.status(404).json({ error: ZENDESK_NOT_CONNECTED_ERROR })

    res.json(describeZendeskConnection(connection))
  } catch (err) {
    console.error('Failed to save the Zendesk write access:', err)
    res.status(500).json({ error: 'Failed to save the Zendesk write access.' })
  }
})

export default router
