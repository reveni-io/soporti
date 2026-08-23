import { Router } from 'express'
import { createOrRefreshShare, getShare } from '../db/shares.js'
import { getSharedArtifact } from '../db/artifacts.js'
import { SHARE_ID_RE, UUID_RE } from '../constants.js'

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

router.get('/artifact/:shareId', async (req, res) => {
  if (!SHARE_ID_RE.test(req.params.shareId)) {
    return res.status(400).json({ error: 'Invalid share link.' })
  }

  try {
    const artifact = await getSharedArtifact(req.params.shareId)
    if (!artifact) return res.status(404).json({ error: 'Shared artifact not found or expired.' })

    res.json(artifact)
  } catch (err) {
    console.error('Failed to load the shared artifact:', err)
    res.status(500).json({ error: 'Failed to load the shared artifact.' })
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
