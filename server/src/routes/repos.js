import { Router } from 'express'
import { listRepos } from '../github/client.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const repos = await listRepos()
    res.json({ repos })
  } catch (err) {
    console.error('Error listing repos:', err.message)
    res.status(500).json({ error: 'Failed to fetch repositories.' })
  }
})

export default router
