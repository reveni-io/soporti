import { Router } from 'express'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Web sidebar history. All routes are scoped to req.user (JWT auth is applied
// globally in index.js). Slack conversations are never exposed here.
export default function conversationsRoute(conversationStore) {
  const router = Router()

  router.get('/', async (req, res) => {
    try {
      const list = await conversationStore.listWeb(req.user.id)
      res.json({ conversations: list })
    } catch (err) {
      console.error('Failed to list conversations:', err)
      res.status(500).json({ error: 'Failed to list conversations.' })
    }
  })

  router.get('/:id', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid conversation ID.' })
    }
    try {
      const messages = await conversationStore.getWebMessages(req.params.id, req.user.id)
      if (messages === null) return res.status(404).json({ error: 'Conversation not found.' })
      res.json({ messages })
    } catch (err) {
      console.error('Failed to load conversation:', err)
      res.status(500).json({ error: 'Failed to load conversation.' })
    }
  })

  router.delete('/:id', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid conversation ID.' })
    }
    try {
      const removed = await conversationStore.deleteWeb(req.params.id, req.user.id)
      if (!removed) return res.status(404).json({ error: 'Conversation not found.' })
      res.json({ ok: true })
    } catch (err) {
      console.error('Failed to delete conversation:', err)
      res.status(500).json({ error: 'Failed to delete conversation.' })
    }
  })

  return router
}
