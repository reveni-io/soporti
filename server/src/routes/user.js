import { Router } from 'express'
import { getCustomInstructions, updateCustomInstructions } from '../db/users.js'
import { isGranolaConfigured, setGranolaApiKey } from '../granola/settings.js'
import { MAX_INSTRUCTIONS_LENGTH } from '../constants.js'

const router = Router()

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

export default router
