import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('beautiful-mermaid', () => ({
  renderMermaid: vi.fn(),
}))

import { renderMermaid } from 'beautiful-mermaid'
import router from './mermaid.js'

const app = express()
app.use(express.json())
app.use('/', router)

describe('POST /render', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders mermaid chart to SVG', async () => {
    renderMermaid.mockResolvedValue('<svg>diagram</svg>')

    const res = await request(app).post('/render').send({ chart: 'flowchart TD\n    A --> B' })

    expect(res.status).toBe(200)
    expect(res.body.svg).toBe('<svg>diagram</svg>')
    expect(renderMermaid).toHaveBeenCalledWith('flowchart TD\n    A --> B', {
      bg: '#ffffff',
      fg: '#042503',
    })
  })

  it('returns 400 for missing chart', async () => {
    const res = await request(app).post('/render').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Missing')
  })

  it('returns 400 for non-string chart', async () => {
    const res = await request(app).post('/render').send({ chart: 123 })
    expect(res.status).toBe(400)
  })

  it('returns 500 on render error', async () => {
    renderMermaid.mockRejectedValue(new Error('Parse error'))

    const res = await request(app).post('/render').send({ chart: 'invalid' })

    expect(res.status).toBe(500)
    expect(res.body.error).toContain('Parse error')
  })
})
