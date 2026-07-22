import { Router } from 'express'
import { getCustomInstructions, updateCustomInstructions } from '../db/users.js'

const router = Router()

const MAX_INSTRUCTIONS_LENGTH = 50_000

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

export default router
