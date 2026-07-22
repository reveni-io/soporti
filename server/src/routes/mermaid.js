import { Router } from 'express'
import { renderMermaid } from 'beautiful-mermaid'

const router = Router()

router.post('/render', async (req, res) => {
  const { chart } = req.body

  if (!chart || typeof chart !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "chart" string.' })
  }

  try {
    const svg = await renderMermaid(chart, {
      bg: '#ffffff',
      fg: '#042503',
    })
    res.json({ svg })
  } catch (err) {
    console.error('[mermaid] Render failed:', err.message)
    res.status(500).json({ error: err.message || 'Mermaid rendering failed.' })
  }
})

export default router
