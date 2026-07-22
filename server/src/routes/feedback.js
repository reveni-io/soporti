import { Router } from 'express'
import { processFeedback } from '../knowledge/feedback.js'

const router = Router()

router.post('/', async (req, res) => {
  const { feedbackId, useful } = req.body

  if (!feedbackId || typeof feedbackId !== 'string') {
    return res.status(400).json({ error: 'A "feedbackId" string is required.' })
  }

  if (typeof useful !== 'boolean') {
    return res.status(400).json({ error: 'A "useful" boolean is required.' })
  }

  try {
    const result = await processFeedback(feedbackId, useful)
    res.json(result)
  } catch (err) {
    console.error('Feedback error:', err)
    res.status(500).json({ error: 'Failed to process feedback.' })
  }
})

export default router
