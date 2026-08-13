import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../integrations/catalog.js', () => ({ listConfiguredIntegrations: vi.fn() }))

const { listConfiguredIntegrations } = await import('../integrations/catalog.js')
const { default: router } = await import('./integrations.js')

const app = express()
app.use((req, _res, next) => {
  req.user = { id: 7 }
  next()
})
app.use('/', router)

beforeEach(() => vi.clearAllMocks())

describe('GET /api/integrations', () => {
  it('returns the integrations configured for the requesting user', async () => {
    listConfiguredIntegrations.mockResolvedValue([
      { id: 'github', name: 'GitHub', description: 'Explore repositories', selectable: false },
      { id: 'notion', name: 'Notion', description: 'Search and read Notion pages', selectable: true },
    ])

    const res = await request(app).get('/')

    expect(res.status).toBe(200)
    expect(res.body.integrations.map(integration => integration.id)).toEqual(['github', 'notion'])
    expect(listConfiguredIntegrations).toHaveBeenCalledWith(7)
  })

  it('returns a generic 500 when the catalog cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    listConfiguredIntegrations.mockRejectedValue(new Error('notion: connection refused at 10.0.0.3'))

    const res = await request(app).get('/')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to list the integrations.' })
  })
})
