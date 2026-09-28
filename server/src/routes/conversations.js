import { Router } from 'express'
import { UUID_RE } from '../constants.js'

const MAX_SEARCH_QUERY_LENGTH = 200

function parseSearchQuery(raw) {
  if (raw === undefined) return { value: '' }
  if (typeof raw !== 'string') return { error: 'Invalid search query.' }

  const value = raw.trim()
  if (value.length > MAX_SEARCH_QUERY_LENGTH) {
    return { error: `Search query is too long (max ${MAX_SEARCH_QUERY_LENGTH} characters).` }
  }

  return { value }
}

export default function conversationsRoute(conversationStore) {
  const router = Router()

  router.get('/', async (req, res) => {
    const { error, value: query } = parseSearchQuery(req.query.q)
    if (error) return res.status(400).json({ error })

    try {
      const list = query
        ? await conversationStore.searchWeb(req.user.id, query)
        : await conversationStore.listWeb(req.user.id)
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
