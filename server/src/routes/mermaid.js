import { Router } from 'express'
import { renderMermaid } from 'beautiful-mermaid'
import { MERMAID_RENDER_COLORS } from '../constants.js'

const router = Router()

router.post('/render', async (req, res) => {
  const { chart } = req.body

  if (!chart || typeof chart !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "chart" string.' })
  }

  try {
    const svg = await renderMermaid(chart, MERMAID_RENDER_COLORS)
    res.json({ svg })
  } catch (err) {
    console.error('[mermaid] Render failed:', err.message)
    res.status(500).json({ error: err.message || 'Mermaid rendering failed.' })
  }
})

export default router
