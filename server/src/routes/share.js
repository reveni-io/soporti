import { Router } from 'express'

export default function shareRoute(shareStore) {
  const router = Router()

  router.post('/', (req, res) => {
    const { messages, shareId } = req.body || {}

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' })
    }

    if (shareId) {
      const existing = shareStore.refresh(shareId, messages)
      if (existing) {
        return res.json({
          shareId: existing.id,
          url: `/share/${existing.id}`,
        })
      }
    }

    const share = shareStore.create(messages)
    res.json({
      shareId: share.id,
      url: `/share/${share.id}`,
    })
  })

  router.get('/:id', (req, res) => {
    const share = shareStore.get(req.params.id)
    if (!share) {
      return res.status(404).json({ error: 'Shared conversation not found or expired.' })
    }

    res.json({
      id: share.id,
      title: share.title,
      messages: share.messages,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
    })
  })

  return router
}
