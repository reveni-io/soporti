import { Router } from 'express'
import { createOrRefreshShare, getShare } from '../db/shares.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const router = Router()

router.post('/', async (req, res) => {
  const { conversationId } = req.body || {}
  if (typeof conversationId !== 'string' || !UUID_RE.test(conversationId)) {
    return res.status(400).json({ error: 'A valid "conversationId" is required.' })
  }
  try {
    const result = await createOrRefreshShare(conversationId, req.user.id)
    if (result.status === 'not_found') return res.status(404).json({ error: 'Conversation not found.' })
    if (result.status === 'empty') return res.status(400).json({ error: 'Conversation has no messages to share yet.' })
    res.json({ shareId: result.shareId, url: `/share/${result.shareId}` })
  } catch (err) {
    console.error('Failed to create share:', err)
    res.status(500).json({ error: 'Failed to create share.' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const share = await getShare(req.params.id)
    if (!share) return res.status(404).json({ error: 'Shared conversation not found or expired.' })
    res.json(share)
  } catch (err) {
    console.error('Failed to load share:', err)
    res.status(500).json({ error: 'Failed to load share.' })
  }
})

export default router
