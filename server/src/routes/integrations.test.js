import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const notionIsConfigured = vi.fn()
const postgresIsConfigured = vi.fn()
const helpjuiceIsConfigured = vi.fn()
const shopifyIsConfigured = vi.fn()
const googleDriveIsConfigured = vi.fn()
const shortcutIsConfigured = vi.fn()
const sentryIsConfigured = vi.fn()

vi.mock('../notion/client.js', () => ({
  isConfigured: (...args) => notionIsConfigured(...args),
}))

vi.mock('../postgres/client.js', () => ({
  isConfigured: (...args) => postgresIsConfigured(...args),
}))

vi.mock('../helpjuice/client.js', () => ({
  isConfigured: (...args) => helpjuiceIsConfigured(...args),
}))

vi.mock('../shopify/client.js', () => ({
  isConfigured: (...args) => shopifyIsConfigured(...args),
}))

vi.mock('../google-drive/client.js', () => ({
  isConfigured: (...args) => googleDriveIsConfigured(...args),
}))

vi.mock('../shortcut/client.js', () => ({
  isConfigured: (...args) => shortcutIsConfigured(...args),
}))

vi.mock('../sentry/client.js', () => ({
  isConfigured: (...args) => sentryIsConfigured(...args),
}))

const { default: router } = await import('./integrations.js')

const app = express()
app.use('/', router)

function configureAll(value) {
  notionIsConfigured.mockReturnValue(value)
  postgresIsConfigured.mockReturnValue(value)
  helpjuiceIsConfigured.mockReturnValue(value)
  shopifyIsConfigured.mockReturnValue(value)
  googleDriveIsConfigured.mockReturnValue(value)
  shortcutIsConfigured.mockReturnValue(value)
  sentryIsConfigured.mockReturnValue(value)
}

describe('GET /api/integrations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns all integrations when configured', async () => {
    configureAll(true)

    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body.integrations.map(i => i.id)).toEqual([
      'github',
      'notion',
      'postgres',
      'helpjuice',
      'shopify',
      'google-drive',
      'shortcut',
      'sentry',
    ])
  })

  it('marks always-on integrations as not selectable', async () => {
    configureAll(true)

    const res = await request(app).get('/')
    const byId = Object.fromEntries(res.body.integrations.map(i => [i.id, i.selectable]))
    expect(byId.github).toBe(false)
    expect(byId.shortcut).toBe(false)
    expect(byId.sentry).toBe(false)
    expect(byId.notion).toBe(true)
    expect(byId.postgres).toBe(true)
    expect(byId.helpjuice).toBe(true)
    expect(byId.shopify).toBe(true)
    expect(byId['google-drive']).toBe(true)
  })

  it('returns GitHub plus Notion when only Notion is configured', async () => {
    configureAll(false)
    notionIsConfigured.mockReturnValue(true)

    const res = await request(app).get('/')
    expect(res.body.integrations.map(i => i.id)).toEqual(['github', 'notion'])
  })

  it('returns only GitHub when none configured', async () => {
    configureAll(false)

    const res = await request(app).get('/')
    expect(res.body.integrations.map(i => i.id)).toEqual(['github'])
  })
})
