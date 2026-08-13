import { Router } from 'express'
import { listConfiguredIntegrations } from '../integrations/catalog.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    res.json({ integrations: await listConfiguredIntegrations(req.user.id) })
  } catch (err) {
    console.error('Failed to list the integrations:', err)
    res.status(500).json({ error: 'Failed to list the integrations.' })
  }
})

export default router
