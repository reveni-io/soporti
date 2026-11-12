import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../db/analytics-cards.js', () => {
  return {
    countCards: vi.fn(),
    createCard: vi.fn(),
    listCardLayouts: vi.fn(),
    listCards: vi.fn(),
    saveCardLayouts: vi.fn(),
  }
})
vi.mock('../db/analytics-dashboards.js', () => {
  return {
    countDashboards: vi.fn(),
    createDashboard: vi.fn(),
    deleteDashboard: vi.fn(),
    ensureDashboard: vi.fn(),
    getDashboard: vi.fn(),
    listDashboards: vi.fn(),
    updateDashboard: vi.fn(),
  }
})
vi.mock('../analytics/generator.js', () => ({
  startGeneration: vi.fn(),
  cancelGeneration: vi.fn(),
  countActiveGenerations: vi.fn(() => 0),
}))
vi.mock('../llm/model.js', () => ({ isConfigured: vi.fn() }))
vi.mock('../postgres/settings.js', () => ({ isPostgresConfigured: vi.fn() }))

const cards = await import('../db/analytics-cards.js')
const dashboards = await import('../db/analytics-dashboards.js')
const { startGeneration, cancelGeneration } = await import('../analytics/generator.js')
const { isConfigured: isLlmConfigured } = await import('../llm/model.js')
const { isPostgresConfigured } = await import('../postgres/settings.js')
const { default: dashboardsRouter } = await import('./analytics-dashboards.js')

const DASHBOARD_ID = '5b0c9d1e-2f3a-4b4c-8d5e-6f7a8b9c0d1e'
const CARD_ID = '8c1d2e3f-4a5b-4c6d-9e7f-a0b1c2d3e4f5'
const OTHER_CARD_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'
const TIMESTAMP = '2026-11-12T10:00:00.000Z'
const NOT_FOUND_ERROR = 'Dashboard not found.'
const OWNER_ONLY_ERROR = 'Only the owner of a dashboard can rename, share or delete it.'

function dashboard(overrides = {}) {
  return {
    id: DASHBOARD_ID,
    name: 'Returns overview',
    shared: false,
    isOwner: true,
    ownerName: 'Sergio Zamarro',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  }
}

function sharedByAnother(overrides = {}) {
  return dashboard({ shared: true, isOwner: false, ownerName: 'Ana Ruiz', ...overrides })
}

function generatingCard(overrides = {}) {
  return {
    id: CARD_ID,
    title: 'Returns per week',
    prompt: 'Returns per week',
    sql: null,
    chart: null,
    layout: { x: 0, y: 0, w: 6, h: 4 },
    status: 'generating',
    step: 'Starting',
    error: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  }
}

describe('analytics dashboards routes', () => {
  let app
  let consoleError
  let userId

  beforeEach(() => {
    vi.clearAllMocks()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    userId = 7
    isPostgresConfigured.mockResolvedValue(true)
    isLlmConfigured.mockResolvedValue(true)
    dashboards.getDashboard.mockResolvedValue(dashboard())
    cards.countCards.mockResolvedValue({ total: 0, generating: 0 })
    cards.listCardLayouts.mockResolvedValue([])
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.user = { id: userId }
      next()
    })
    app.use('/', dashboardsRouter)
  })

  describe('GET /', () => {
    it('returns the dashboards the caller can open and whether a database is connected', async () => {
      const listed = [dashboard(), sharedByAnother({ id: OTHER_CARD_ID, name: 'Refunds' })]
      dashboards.listDashboards.mockResolvedValue(listed)

      const res = await request(app).get('/')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ configured: true, dashboards: listed })
      expect(dashboards.listDashboards).toHaveBeenCalledTimes(1)
      expect(dashboards.listDashboards).toHaveBeenCalledWith(7)
      expect(dashboards.ensureDashboard).not.toHaveBeenCalled()
    })

    it('creates the first dashboard of a caller who owns none, even when others share theirs', async () => {
      dashboards.listDashboards
        .mockResolvedValueOnce([sharedByAnother()])
        .mockResolvedValueOnce([dashboard({ name: 'My dashboard' }), sharedByAnother()])

      const res = await request(app).get('/')

      expect(res.status).toBe(200)
      expect(res.body.dashboards).toEqual([dashboard({ name: 'My dashboard' }), sharedByAnother()])
      expect(dashboards.ensureDashboard).toHaveBeenCalledTimes(1)
      expect(dashboards.ensureDashboard).toHaveBeenCalledWith(7)
      expect(dashboards.listDashboards).toHaveBeenCalledTimes(2)
    })

    it('reports a database that is not connected', async () => {
      isPostgresConfigured.mockResolvedValue(false)
      dashboards.listDashboards.mockResolvedValue([dashboard()])

      const res = await request(app).get('/')

      expect(res.body).toEqual({ configured: false, dashboards: [dashboard()] })
    })

    it('returns 500 when the dashboards cannot be loaded', async () => {
      dashboards.listDashboards.mockRejectedValue(new Error('db down'))

      const res = await request(app).get('/')

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to load your dashboards.' })
      expect(consoleError).toHaveBeenCalledTimes(1)
    })
  })

  describe('POST /', () => {
    it('creates a dashboard with the trimmed name', async () => {
      dashboards.countDashboards.mockResolvedValue(19)
      dashboards.createDashboard.mockResolvedValue(dashboard())

      const res = await request(app).post('/').send({ name: '  Returns overview ' })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ dashboard: dashboard() })
      expect(dashboards.countDashboards).toHaveBeenCalledWith(7)
      expect(dashboards.createDashboard).toHaveBeenCalledTimes(1)
      expect(dashboards.createDashboard).toHaveBeenCalledWith(7, 'Returns overview')
    })

    it.each([
      { kind: 'a missing name', body: {}, error: 'Write a name.' },
      { kind: 'a blank name', body: { name: '   ' }, error: 'Write a name.' },
      { kind: 'a name that is not text', body: { name: 42 }, error: 'Write a name.' },
      {
        kind: 'a name over 80 characters',
        body: { name: 'n'.repeat(81) },
        error: 'The name is too long (max 80 characters).',
      },
    ])('rejects $kind', async ({ body, error }) => {
      const res = await request(app).post('/').send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error })
      expect(dashboards.createDashboard).not.toHaveBeenCalled()
    })

    it('refuses a dashboard beyond the limit of 20 per user', async () => {
      dashboards.countDashboards.mockResolvedValue(20)

      const res = await request(app).post('/').send({ name: 'One more' })

      expect(res.status).toBe(422)
      expect(res.body).toEqual({ error: 'You can only have 20 dashboards. Delete one first.' })
      expect(dashboards.createDashboard).not.toHaveBeenCalled()
    })

    it('returns 500 when the dashboard cannot be created', async () => {
      dashboards.countDashboards.mockResolvedValue(0)
      dashboards.createDashboard.mockRejectedValue(new Error('db down'))

      const res = await request(app).post('/').send({ name: 'Returns overview' })

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to create the dashboard.' })
    })
  })

  describe('PUT /:id', () => {
    it.each([
      { kind: 'renames', body: { name: ' Refunds ' }, changes: { name: 'Refunds' } },
      { kind: 'shares', body: { shared: true }, changes: { shared: true } },
      { kind: 'unshares', body: { shared: false }, changes: { shared: false } },
      {
        kind: 'renames and shares',
        body: { name: 'Refunds', shared: true },
        changes: { shared: true, name: 'Refunds' },
      },
    ])('$kind a dashboard of its owner', async ({ body, changes }) => {
      dashboards.updateDashboard.mockResolvedValue(dashboard(changes))

      const res = await request(app).put(`/${DASHBOARD_ID}`).send(body)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ dashboard: dashboard(changes) })
      expect(dashboards.getDashboard).toHaveBeenCalledWith(DASHBOARD_ID, 7)
      expect(dashboards.updateDashboard).toHaveBeenCalledTimes(1)
      expect(dashboards.updateDashboard).toHaveBeenCalledWith(DASHBOARD_ID, 7, changes)
    })

    it.each([
      { kind: 'an empty body', body: {}, error: 'Send a name or a sharing setting to change.' },
      { kind: 'a shared flag that is text', body: { shared: 'yes' }, error: 'Shared must be true or false.' },
      { kind: 'a null shared flag', body: { name: 'Refunds', shared: null }, error: 'Shared must be true or false.' },
      { kind: 'a blank name', body: { name: ' ', shared: true }, error: 'Write a name.' },
      { kind: 'a null name', body: { name: null }, error: 'Write a name.' },
      {
        kind: 'a name over 80 characters',
        body: { name: 'n'.repeat(81) },
        error: 'The name is too long (max 80 characters).',
      },
    ])('rejects $kind', async ({ body, error }) => {
      const res = await request(app).put(`/${DASHBOARD_ID}`).send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error })
      expect(dashboards.getDashboard).not.toHaveBeenCalled()
      expect(dashboards.updateDashboard).not.toHaveBeenCalled()
    })

    it('rejects an invalid dashboard id', async () => {
      const res = await request(app).put('/nope').send({ name: 'Refunds' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Invalid dashboard ID.' })
    })

    it('answers 403 to a collaborator who can open the dashboard but does not own it', async () => {
      userId = 9
      dashboards.getDashboard.mockResolvedValue(sharedByAnother())

      const res = await request(app).put(`/${DASHBOARD_ID}`).send({ shared: false })

      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: OWNER_ONLY_ERROR })
      expect(dashboards.getDashboard).toHaveBeenCalledWith(DASHBOARD_ID, 9)
      expect(dashboards.updateDashboard).not.toHaveBeenCalled()
    })

    it('answers 404 to a stranger on a private dashboard, like for one that does not exist', async () => {
      userId = 9
      dashboards.getDashboard.mockResolvedValue(null)

      const res = await request(app).put(`/${DASHBOARD_ID}`).send({ name: 'Mine now' })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: NOT_FOUND_ERROR })
      expect(dashboards.updateDashboard).not.toHaveBeenCalled()
    })

    it('answers 404 when the dashboard is deleted before the change is saved', async () => {
      dashboards.updateDashboard.mockResolvedValue(null)

      const res = await request(app).put(`/${DASHBOARD_ID}`).send({ name: 'Refunds' })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: NOT_FOUND_ERROR })
    })

    it('returns 500 when the change cannot be saved', async () => {
      dashboards.updateDashboard.mockRejectedValue(new Error('db down'))

      const res = await request(app).put(`/${DASHBOARD_ID}`).send({ name: 'Refunds' })

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to save the dashboard.' })
    })
  })

  describe('DELETE /:id', () => {
    it('deletes a dashboard of its owner and cancels the generations of its cards', async () => {
      dashboards.deleteDashboard.mockResolvedValue([CARD_ID, OTHER_CARD_ID])

      const res = await request(app).delete(`/${DASHBOARD_ID}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(dashboards.deleteDashboard).toHaveBeenCalledTimes(1)
      expect(dashboards.deleteDashboard).toHaveBeenCalledWith(DASHBOARD_ID, 7)
      expect(cancelGeneration.mock.calls.map(([cardId]) => cardId)).toEqual([CARD_ID, OTHER_CARD_ID])
    })

    it('cancels nothing when no card was generating', async () => {
      dashboards.deleteDashboard.mockResolvedValue([])

      const res = await request(app).delete(`/${DASHBOARD_ID}`)

      expect(res.status).toBe(200)
      expect(cancelGeneration).not.toHaveBeenCalled()
    })

    it('answers 403 to a collaborator and deletes nothing', async () => {
      userId = 9
      dashboards.getDashboard.mockResolvedValue(sharedByAnother())

      const res = await request(app).delete(`/${DASHBOARD_ID}`)

      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: OWNER_ONLY_ERROR })
      expect(dashboards.deleteDashboard).not.toHaveBeenCalled()
      expect(cancelGeneration).not.toHaveBeenCalled()
    })

    it('answers 404 to a stranger on a private dashboard', async () => {
      userId = 9
      dashboards.getDashboard.mockResolvedValue(null)

      const res = await request(app).delete(`/${DASHBOARD_ID}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: NOT_FOUND_ERROR })
      expect(dashboards.deleteDashboard).not.toHaveBeenCalled()
    })

    it('answers 404 and cancels nothing when the dashboard was already deleted', async () => {
      dashboards.deleteDashboard.mockResolvedValue(null)

      const res = await request(app).delete(`/${DASHBOARD_ID}`)

      expect(res.status).toBe(404)
      expect(cancelGeneration).not.toHaveBeenCalled()
    })

    it('rejects an invalid dashboard id', async () => {
      const res = await request(app).delete('/42')

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Invalid dashboard ID.' })
      expect(dashboards.getDashboard).not.toHaveBeenCalled()
    })

    it('returns 500 when the delete fails', async () => {
      dashboards.deleteDashboard.mockRejectedValue(new Error('db down'))

      const res = await request(app).delete(`/${DASHBOARD_ID}`)

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to delete the dashboard.' })
    })
  })

  describe('GET /:id/cards', () => {
    it('returns the dashboard and its cards', async () => {
      const listed = [generatingCard({ status: 'ready', step: null })]
      cards.listCards.mockResolvedValue(listed)

      const res = await request(app).get(`/${DASHBOARD_ID}/cards`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ dashboard: dashboard(), cards: listed })
      expect(dashboards.getDashboard).toHaveBeenCalledWith(DASHBOARD_ID, 7)
      expect(cards.listCards).toHaveBeenCalledTimes(1)
      expect(cards.listCards).toHaveBeenCalledWith(DASHBOARD_ID, 7)
    })

    it('opens a shared dashboard for someone who does not own it', async () => {
      userId = 9
      dashboards.getDashboard.mockResolvedValue(sharedByAnother())
      cards.listCards.mockResolvedValue([])

      const res = await request(app).get(`/${DASHBOARD_ID}/cards`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ dashboard: sharedByAnother(), cards: [] })
      expect(cards.listCards).toHaveBeenCalledWith(DASHBOARD_ID, 9)
    })

    it('answers 404 to a stranger on a private dashboard without listing its cards', async () => {
      userId = 9
      dashboards.getDashboard.mockResolvedValue(null)

      const res = await request(app).get(`/${DASHBOARD_ID}/cards`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: NOT_FOUND_ERROR })
      expect(cards.listCards).not.toHaveBeenCalled()
    })

    it('returns 500 when the cards cannot be loaded', async () => {
      cards.listCards.mockRejectedValue(new Error('db down'))

      const res = await request(app).get(`/${DASHBOARD_ID}/cards`)

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to load the charts of the dashboard.' })
    })
  })

  describe('POST /:id/cards', () => {
    it('creates a generating card in the dashboard, titled after the question, and starts the agent', async () => {
      cards.createCard.mockResolvedValue(generatingCard())

      const res = await request(app).post(`/${DASHBOARD_ID}/cards`).send({ prompt: '  Returns per week  ' })

      expect(res.status).toBe(202)
      expect(res.body).toEqual({ card: generatingCard() })
      expect(cards.createCard).toHaveBeenCalledTimes(1)
      expect(cards.createCard).toHaveBeenCalledWith(DASHBOARD_ID, {
        title: 'Returns per week',
        prompt: 'Returns per week',
        layout: { x: 0, y: 0, w: 6, h: 4 },
      })
      expect(startGeneration).toHaveBeenCalledTimes(1)
      expect(startGeneration).toHaveBeenCalledWith(generatingCard(), 7)
    })

    it('places the card in the first free slot of the grid of that dashboard', async () => {
      cards.listCardLayouts.mockResolvedValue([{ x: 0, y: 0, w: 6, h: 4 }])
      cards.createCard.mockResolvedValue(generatingCard())

      await request(app).post(`/${DASHBOARD_ID}/cards`).send({ prompt: 'Orders per store' })

      expect(cards.listCardLayouts).toHaveBeenCalledWith(DASHBOARD_ID, 7)
      expect(cards.createCard.mock.calls[0][1].layout).toEqual({ x: 6, y: 0, w: 6, h: 4 })
    })

    it('shortens the title of a long question to 120 characters', async () => {
      cards.createCard.mockResolvedValue(generatingCard())
      const prompt = `Show me ${'the returns '.repeat(30)}per week`

      await request(app).post(`/${DASHBOARD_ID}/cards`).send({ prompt })

      const { title } = cards.createCard.mock.calls[0][1]
      expect(title).toHaveLength(120)
      expect(title.endsWith('…')).toBe(true)
      expect(cards.createCard.mock.calls[0][1].prompt).toBe(prompt)
    })

    it('lets a collaborator add a chart to a shared dashboard, run under their own user', async () => {
      userId = 9
      dashboards.getDashboard.mockResolvedValue(sharedByAnother())
      cards.createCard.mockResolvedValue(generatingCard())

      const res = await request(app).post(`/${DASHBOARD_ID}/cards`).send({ prompt: 'Returns per week' })

      expect(res.status).toBe(202)
      expect(cards.countCards).toHaveBeenCalledWith(DASHBOARD_ID, 9)
      expect(startGeneration).toHaveBeenCalledWith(generatingCard(), 9)
    })

    it.each([
      { kind: 'a missing question', body: {}, error: 'Write a question.' },
      { kind: 'a blank question', body: { prompt: '   ' }, error: 'Write a question.' },
      {
        kind: 'a question that is too long',
        body: { prompt: 'x'.repeat(2001) },
        error: 'The question is too long (max 2000 characters).',
      },
    ])('rejects $kind before checking anything else', async ({ body, error }) => {
      const res = await request(app).post(`/${DASHBOARD_ID}/cards`).send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error })
      expect(dashboards.getDashboard).not.toHaveBeenCalled()
      expect(cards.createCard).not.toHaveBeenCalled()
    })

    it('answers 404 to a stranger on a private dashboard before any other check', async () => {
      userId = 9
      dashboards.getDashboard.mockResolvedValue(null)
      isPostgresConfigured.mockResolvedValue(false)

      const res = await request(app).post(`/${DASHBOARD_ID}/cards`).send({ prompt: 'Returns per week' })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: NOT_FOUND_ERROR })
      expect(isPostgresConfigured).not.toHaveBeenCalled()
      expect(cards.createCard).not.toHaveBeenCalled()
      expect(startGeneration).not.toHaveBeenCalled()
    })

    it.each([
      {
        kind: 'no database is connected',
        setup: () => isPostgresConfigured.mockResolvedValue(false),
        error: 'Connect a database in /admin (Database section) first.',
      },
      {
        kind: 'the assistant is not configured',
        setup: () => isLlmConfigured.mockResolvedValue(false),
        error: 'The assistant is not configured yet. Ask an admin to set it up in /admin (LLM section).',
      },
      {
        kind: 'the dashboard already has 40 charts',
        setup: () => cards.countCards.mockResolvedValue({ total: 40, generating: 0 }),
        error: 'A dashboard can only have 40 charts. Delete one first.',
      },
      {
        kind: 'three charts of the dashboard are already generating',
        setup: () => cards.countCards.mockResolvedValue({ total: 5, generating: 3 }),
        error: 'A dashboard can only generate 3 charts at a time. Wait for one to finish.',
      },
    ])('refuses when $kind', async ({ setup, error }) => {
      setup()

      const res = await request(app).post(`/${DASHBOARD_ID}/cards`).send({ prompt: 'Returns per week' })

      expect(res.status).toBe(422)
      expect(res.body).toEqual({ error })
      expect(cards.createCard).not.toHaveBeenCalled()
      expect(startGeneration).not.toHaveBeenCalled()
    })

    it('counts the charts of that dashboard, not of the user', async () => {
      cards.createCard.mockResolvedValue(generatingCard())

      await request(app).post(`/${DASHBOARD_ID}/cards`).send({ prompt: 'Returns per week' })

      expect(cards.countCards).toHaveBeenCalledTimes(1)
      expect(cards.countCards).toHaveBeenCalledWith(DASHBOARD_ID, 7)
    })

    it('returns 500 and starts nothing when the card cannot be created', async () => {
      cards.createCard.mockRejectedValue(new Error('db down'))

      const res = await request(app).post(`/${DASHBOARD_ID}/cards`).send({ prompt: 'Returns per week' })

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to create the chart.' })
      expect(startGeneration).not.toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalledTimes(1)
    })
  })

  describe('PUT /:id/layout', () => {
    it('saves the positions of the cards of that dashboard', async () => {
      const items = [{ id: CARD_ID, x: 6, y: 4, w: 6, h: 5 }]

      const res = await request(app).put(`/${DASHBOARD_ID}/layout`).send({ items })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(cards.saveCardLayouts).toHaveBeenCalledTimes(1)
      expect(cards.saveCardLayouts).toHaveBeenCalledWith(DASHBOARD_ID, 7, items)
    })

    it('lets a collaborator move the cards of a shared dashboard', async () => {
      userId = 9
      dashboards.getDashboard.mockResolvedValue(sharedByAnother())
      const items = [{ id: CARD_ID, x: 0, y: 0, w: 12, h: 4 }]

      const res = await request(app).put(`/${DASHBOARD_ID}/layout`).send({ items })

      expect(res.status).toBe(200)
      expect(cards.saveCardLayouts).toHaveBeenCalledWith(DASHBOARD_ID, 9, items)
    })

    it.each([
      { kind: 'missing items', body: {}, error: 'Items must be a list of up to 40 card positions.' },
      {
        kind: 'an invalid card id',
        body: { items: [{ id: 'nope', x: 0, y: 0, w: 6, h: 4 }] },
        error: 'Every card position needs a valid card ID.',
      },
    ])('rejects $kind', async ({ body, error }) => {
      const res = await request(app).put(`/${DASHBOARD_ID}/layout`).send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error })
      expect(cards.saveCardLayouts).not.toHaveBeenCalled()
    })

    it('rejects a position that leaves the grid', async () => {
      const res = await request(app)
        .put(`/${DASHBOARD_ID}/layout`)
        .send({ items: [{ id: CARD_ID, x: 8, y: 0, w: 6, h: 4 }] })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/^Every card position must fit the 12-column grid/)
    })

    it('answers 404 to a stranger on a private dashboard and saves nothing', async () => {
      userId = 9
      dashboards.getDashboard.mockResolvedValue(null)

      const res = await request(app)
        .put(`/${DASHBOARD_ID}/layout`)
        .send({ items: [{ id: CARD_ID, x: 0, y: 0, w: 6, h: 4 }] })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: NOT_FOUND_ERROR })
      expect(cards.saveCardLayouts).not.toHaveBeenCalled()
    })

    it('returns 500 when the layout cannot be saved', async () => {
      cards.saveCardLayouts.mockRejectedValue(new Error('db down'))

      const res = await request(app)
        .put(`/${DASHBOARD_ID}/layout`)
        .send({ items: [{ id: CARD_ID, x: 0, y: 0, w: 6, h: 4 }] })

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to save the layout.' })
    })
  })
})
