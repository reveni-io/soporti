import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

class FakeQueryError extends Error {}

vi.mock('../db/analytics-cards.js', () => {
  return {
    claimCard: vi.fn(),
    countCards: vi.fn(),
    createCard: vi.fn(),
    deleteCard: vi.fn(),
    getCard: vi.fn(),
    getCardDashboardId: vi.fn(),
    listCardLayouts: vi.fn(),
    listCards: vi.fn(),
    saveCardLayouts: vi.fn(),
    updateCard: vi.fn(),
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
vi.mock('../analytics/generator.js', () => ({ startGeneration: vi.fn(), cancelGeneration: vi.fn() }))
vi.mock('../analytics/query.js', () => {
  return { runChartQuery: vi.fn(), readChartQuery: vi.fn(), QueryError: FakeQueryError }
})
vi.mock('../llm/model.js', () => ({ isConfigured: vi.fn() }))
vi.mock('../postgres/settings.js', () => ({ isPostgresConfigured: vi.fn() }))

const cards = await import('../db/analytics-cards.js')
const dashboards = await import('../db/analytics-dashboards.js')
const { startGeneration, cancelGeneration } = await import('../analytics/generator.js')
const { runChartQuery, readChartQuery } = await import('../analytics/query.js')
const { isConfigured: isLlmConfigured } = await import('../llm/model.js')
const { isPostgresConfigured } = await import('../postgres/settings.js')
const { default: analyticsRouter } = await import('./analytics.js')

const CARD_ID = '8c1d2e3f-4a5b-4c6d-9e7f-a0b1c2d3e4f5'
const DASHBOARD_ID = '5b0c9d1e-2f3a-4b4c-8d5e-6f7a8b9c0d1e'
const TIMESTAMP = '2026-11-12T10:00:00.000Z'
const QUERY = "SELECT date_trunc('week', created_at) AS week, count(*) AS returns FROM returns GROUP BY 1 ORDER BY 1"
const COLUMNS = [
  { name: 'week', kind: 'date' },
  { name: 'returns', kind: 'number' },
]
const ROWS = [{ week: '2026-08-03T00:00:00.000Z', returns: 42 }]
const FETCHED_AT = '2026-11-12T10:04:00.000Z'
const DATA = { columns: COLUMNS, rows: ROWS, truncated: false, fetchedAt: FETCHED_AT }
const CHART = {
  type: 'bar',
  xKey: 'week',
  groupKey: null,
  series: [{ key: 'returns', label: 'Returns' }],
  stacked: false,
}
const TABLE = { type: 'table', xKey: null, groupKey: null, series: [], stacked: false }
const DATABASE_ERROR = 'Connect a database in /admin (Database section) first.'
const LLM_ERROR = 'The assistant is not configured yet. Ask an admin to set it up in /admin (LLM section).'
const GENERATION_LIMIT_ERROR = 'A dashboard can only generate 3 charts at a time. Wait for one to finish.'
const GENERATING_ERROR = 'The chart is still being generated. Wait for it to finish.'
const NO_QUERY_ERROR = 'The chart has no query yet.'

function card(overrides = {}) {
  return {
    id: CARD_ID,
    title: 'Returns per week',
    prompt: 'Returns per week over the last 3 months',
    sql: QUERY,
    chart: CHART,
    layout: { x: 0, y: 0, w: 6, h: 4 },
    status: 'ready',
    step: null,
    error: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  }
}

function generatingCard(overrides = {}) {
  return card({ status: 'generating', step: 'Starting', sql: null, chart: null, ...overrides })
}

describe('analytics routes', () => {
  let app
  let consoleError
  let userId

  beforeEach(() => {
    vi.clearAllMocks()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    userId = 7
    isPostgresConfigured.mockResolvedValue(true)
    isLlmConfigured.mockResolvedValue(true)
    cards.getCardDashboardId.mockResolvedValue(DASHBOARD_ID)
    cards.countCards.mockResolvedValue({ total: 0, generating: 0 })
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.user = { id: userId }
      next()
    })
    app.use('/', analyticsRouter)
  })

  describe('the endpoints that moved under a dashboard', () => {
    it.each([
      { method: 'get', path: '/cards' },
      { method: 'post', path: '/cards' },
      { method: 'put', path: '/layout' },
    ])('no longer answers $method $path', async ({ method, path }) => {
      const res = await request(app)[method](path).send({ prompt: 'Returns per week', items: [] })

      expect(res.status).toBe(404)
      expect(cards.listCards).not.toHaveBeenCalled()
      expect(cards.createCard).not.toHaveBeenCalled()
      expect(cards.saveCardLayouts).not.toHaveBeenCalled()
    })

    it('serves the dashboards under /dashboards', async () => {
      dashboards.getDashboard.mockResolvedValue({ id: DASHBOARD_ID, name: 'Returns overview', isOwner: true })
      cards.listCards.mockResolvedValue([card()])

      const res = await request(app).get(`/dashboards/${DASHBOARD_ID}/cards`)

      expect(res.status).toBe(200)
      expect(res.body.cards).toEqual([card()])
    })

    it('names the right resource when an id is not a UUID', async () => {
      const dashboard = await request(app).get('/dashboards/nope/cards')
      const chart = await request(app).get('/cards/nope/data')

      expect(dashboard.status).toBe(400)
      expect(dashboard.body).toEqual({ error: 'Invalid dashboard ID.' })
      expect(chart.status).toBe(400)
      expect(chart.body).toEqual({ error: 'Invalid chart ID.' })
    })
  })

  describe('access through the dashboard of the card', () => {
    it('lets a collaborator who does not own a shared dashboard change its cards', async () => {
      userId = 9
      cards.getCard.mockResolvedValue(card())
      cards.updateCard.mockResolvedValue(card({ title: 'Weekly returns' }))
      cards.claimCard.mockResolvedValue(card({ status: 'generating' }))
      cards.deleteCard.mockResolvedValue(true)
      readChartQuery.mockResolvedValue(DATA)

      const edited = await request(app).put(`/cards/${CARD_ID}`).send({ title: 'Weekly returns' })
      const revised = await request(app).post(`/cards/${CARD_ID}/revise`).send({ prompt: 'Make it monthly' })
      const data = await request(app).get(`/cards/${CARD_ID}/data`)
      const deleted = await request(app).delete(`/cards/${CARD_ID}`)

      expect([edited.status, revised.status, data.status, deleted.status]).toEqual([200, 202, 200, 200])
      expect(cards.getCard).toHaveBeenCalledWith(CARD_ID, 9)
      expect(cards.updateCard).toHaveBeenCalledWith(CARD_ID, 9, { title: 'Weekly returns' })
      expect(cards.claimCard).toHaveBeenCalledWith(CARD_ID, 9, { from: ['ready', 'failed'], prompt: 'Make it monthly' })
      expect(startGeneration).toHaveBeenCalledWith(card({ status: 'generating' }), 9)
      expect(cards.deleteCard).toHaveBeenCalledWith(CARD_ID, 9)
    })

    it.each([
      { name: 'revise', call: agent => agent.post(`/cards/${CARD_ID}/revise`).send({ prompt: 'Make it monthly' }) },
      { name: 'retry', call: agent => agent.post(`/cards/${CARD_ID}/retry`) },
      { name: 'edit', call: agent => agent.put(`/cards/${CARD_ID}`).send({ title: 'Weekly returns' }) },
      { name: 'delete', call: agent => agent.delete(`/cards/${CARD_ID}`) },
      { name: 'data', call: agent => agent.get(`/cards/${CARD_ID}/data?fresh=true`) },
    ])('answers 404 to a stranger on a card of a private dashboard ($name)', async ({ call }) => {
      userId = 9
      cards.getCardDashboardId.mockResolvedValue(null)
      cards.getCard.mockResolvedValue(null)
      cards.deleteCard.mockResolvedValue(false)

      const res = await call(request(app))

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Chart not found.' })
      expect(cards.claimCard).not.toHaveBeenCalled()
      expect(cards.updateCard).not.toHaveBeenCalled()
      expect(startGeneration).not.toHaveBeenCalled()
      expect(cancelGeneration).not.toHaveBeenCalled()
      expect(runChartQuery).not.toHaveBeenCalled()
    })
  })

  describe('POST /cards/:id/revise', () => {
    it('claims a ready or failed card with the change request and starts the agent', async () => {
      const claimed = card({ status: 'generating', step: 'Starting', prompt: 'Make it monthly' })
      cards.claimCard.mockResolvedValue(claimed)

      const res = await request(app).post(`/cards/${CARD_ID}/revise`).send({ prompt: ' Make it monthly ' })

      expect(res.status).toBe(202)
      expect(res.body).toEqual({ card: claimed })
      expect(cards.claimCard).toHaveBeenCalledTimes(1)
      expect(cards.claimCard).toHaveBeenCalledWith(CARD_ID, 7, { from: ['ready', 'failed'], prompt: 'Make it monthly' })
      expect(startGeneration).toHaveBeenCalledTimes(1)
      expect(startGeneration).toHaveBeenCalledWith(claimed, 7)
    })

    it('checks the limits of the dashboard the card belongs to', async () => {
      cards.claimCard.mockResolvedValue(card({ status: 'generating' }))

      await request(app).post(`/cards/${CARD_ID}/revise`).send({ prompt: 'Make it monthly' })

      expect(cards.getCardDashboardId).toHaveBeenCalledTimes(1)
      expect(cards.getCardDashboardId).toHaveBeenCalledWith(CARD_ID, 7)
      expect(cards.countCards).toHaveBeenCalledTimes(1)
      expect(cards.countCards).toHaveBeenCalledWith(DASHBOARD_ID, 7)
    })

    it('rejects an invalid card id', async () => {
      const res = await request(app).post('/cards/nope/revise').send({ prompt: 'Make it monthly' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Invalid chart ID.' })
      expect(cards.claimCard).not.toHaveBeenCalled()
    })

    it('rejects a blank change request', async () => {
      const res = await request(app).post(`/cards/${CARD_ID}/revise`).send({ prompt: '' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Write a change request.' })
      expect(cards.claimCard).not.toHaveBeenCalled()
    })

    it.each([
      {
        kind: 'no database is connected',
        setup: () => isPostgresConfigured.mockResolvedValue(false),
        error: DATABASE_ERROR,
      },
      {
        kind: 'the assistant is not configured',
        setup: () => isLlmConfigured.mockResolvedValue(false),
        error: LLM_ERROR,
      },
      {
        kind: 'three cards of the dashboard are already generating',
        setup: () => cards.countCards.mockResolvedValue({ total: 5, generating: 3 }),
        error: GENERATION_LIMIT_ERROR,
      },
    ])('refuses when $kind', async ({ setup, error }) => {
      setup()

      const res = await request(app).post(`/cards/${CARD_ID}/revise`).send({ prompt: 'Make it monthly' })

      expect(res.status).toBe(422)
      expect(res.body).toEqual({ error })
      expect(cards.claimCard).not.toHaveBeenCalled()
      expect(startGeneration).not.toHaveBeenCalled()
    })

    it('does not count a full dashboard against a card that already exists', async () => {
      cards.countCards.mockResolvedValue({ total: 40, generating: 0 })
      cards.claimCard.mockResolvedValue(card({ status: 'generating' }))

      const res = await request(app).post(`/cards/${CARD_ID}/revise`).send({ prompt: 'Make it monthly' })

      expect(res.status).toBe(202)
    })

    it('returns 409 while the card is already generating', async () => {
      cards.claimCard.mockResolvedValue(null)
      cards.getCard.mockResolvedValue(generatingCard())

      const res = await request(app).post(`/cards/${CARD_ID}/revise`).send({ prompt: 'Make it monthly' })

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: GENERATING_ERROR })
      expect(cards.getCard).toHaveBeenCalledWith(CARD_ID, 7)
      expect(startGeneration).not.toHaveBeenCalled()
    })

    it('returns 404 before any other check when the card is missing or not accessible', async () => {
      cards.getCardDashboardId.mockResolvedValue(null)
      isPostgresConfigured.mockResolvedValue(false)

      const res = await request(app).post(`/cards/${CARD_ID}/revise`).send({ prompt: 'Make it monthly' })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Chart not found.' })
      expect(isPostgresConfigured).not.toHaveBeenCalled()
      expect(cards.countCards).not.toHaveBeenCalled()
    })

    it('returns 404 when the card disappears before it is claimed', async () => {
      cards.claimCard.mockResolvedValue(null)
      cards.getCard.mockResolvedValue(null)

      const res = await request(app).post(`/cards/${CARD_ID}/revise`).send({ prompt: 'Make it monthly' })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Chart not found.' })
    })

    it('returns 500 when the claim fails', async () => {
      cards.claimCard.mockRejectedValue(new Error('db down'))

      const res = await request(app).post(`/cards/${CARD_ID}/revise`).send({ prompt: 'Make it monthly' })

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to change the chart.' })
    })
  })

  describe('POST /cards/:id/retry', () => {
    it('claims a failed card with its last prompt and starts the agent', async () => {
      const claimed = generatingCard()
      cards.claimCard.mockResolvedValue(claimed)

      const res = await request(app).post(`/cards/${CARD_ID}/retry`)

      expect(res.status).toBe(202)
      expect(res.body).toEqual({ card: claimed })
      expect(cards.claimCard).toHaveBeenCalledTimes(1)
      expect(cards.claimCard).toHaveBeenCalledWith(CARD_ID, 7, { from: ['failed'], prompt: null })
      expect(startGeneration).toHaveBeenCalledWith(claimed, 7)
    })

    it('returns 409 for a card that did not fail', async () => {
      cards.claimCard.mockResolvedValue(null)
      cards.getCard.mockResolvedValue(card())

      const res = await request(app).post(`/cards/${CARD_ID}/retry`)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: 'Only a chart that failed can be retried.' })
      expect(startGeneration).not.toHaveBeenCalled()
    })

    it('returns 404 when the card is missing or not accessible', async () => {
      cards.getCardDashboardId.mockResolvedValue(null)

      const res = await request(app).post(`/cards/${CARD_ID}/retry`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Chart not found.' })
      expect(cards.claimCard).not.toHaveBeenCalled()
    })

    it('refuses when three cards of the dashboard are already generating', async () => {
      cards.countCards.mockResolvedValue({ total: 5, generating: 3 })

      const res = await request(app).post(`/cards/${CARD_ID}/retry`)

      expect(res.status).toBe(422)
      expect(res.body).toEqual({ error: GENERATION_LIMIT_ERROR })
      expect(cards.countCards).toHaveBeenCalledWith(DASHBOARD_ID, 7)
      expect(cards.claimCard).not.toHaveBeenCalled()
    })

    it('refuses when no database is connected', async () => {
      isPostgresConfigured.mockResolvedValue(false)

      const res = await request(app).post(`/cards/${CARD_ID}/retry`)

      expect(res.status).toBe(422)
      expect(res.body).toEqual({ error: DATABASE_ERROR })
      expect(cards.claimCard).not.toHaveBeenCalled()
    })

    it('returns 500 when the checks fail', async () => {
      cards.countCards.mockRejectedValue(new Error('db down'))

      const res = await request(app).post(`/cards/${CARD_ID}/retry`)

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to retry the chart.' })
    })
  })

  describe('PUT /cards/:id', () => {
    it('renames a card without running its query', async () => {
      cards.getCard.mockResolvedValue(card())
      cards.updateCard.mockResolvedValue(card({ title: 'Weekly returns' }))

      const res = await request(app).put(`/cards/${CARD_ID}`).send({ title: '  Weekly returns ' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ card: card({ title: 'Weekly returns' }) })
      expect(cards.updateCard).toHaveBeenCalledTimes(1)
      expect(cards.updateCard).toHaveBeenCalledWith(CARD_ID, 7, { title: 'Weekly returns' })
      expect(runChartQuery).not.toHaveBeenCalled()
    })

    it('runs a new query and stores it with the current chart reconciled against its columns', async () => {
      const sql = 'SELECT store AS shop, count(*) AS orders FROM orders GROUP BY 1'
      const reconciled = { ...CHART, xKey: 'shop', series: [{ key: 'orders', label: 'Orders' }] }
      cards.getCard.mockResolvedValue(card())
      cards.updateCard.mockResolvedValue(card({ sql, chart: reconciled }))
      runChartQuery.mockResolvedValue({
        columns: [
          { name: 'shop', kind: 'text' },
          { name: 'orders', kind: 'number' },
        ],
        rows: [],
        truncated: false,
      })

      const res = await request(app).put(`/cards/${CARD_ID}`).send({ sql })

      expect(res.status).toBe(200)
      expect(runChartQuery).toHaveBeenCalledTimes(1)
      expect(runChartQuery).toHaveBeenCalledWith(sql)
      expect(cards.updateCard).toHaveBeenCalledWith(CARD_ID, 7, { sql, chart: reconciled })
    })

    it('reconciles the chart of the request when it comes with a new query', async () => {
      const sql = 'SELECT week, returns FROM weekly_returns'
      cards.getCard.mockResolvedValue(card())
      cards.updateCard.mockResolvedValue(card({ sql }))
      runChartQuery.mockResolvedValue({ columns: COLUMNS, rows: ROWS, truncated: false })

      await request(app)
        .put(`/cards/${CARD_ID}`)
        .send({ title: 'Weekly returns', sql, chart: { type: 'line', xKey: 'month', series: [{ key: 'returns' }] } })

      expect(cards.updateCard).toHaveBeenCalledWith(CARD_ID, 7, {
        title: 'Weekly returns',
        sql,
        chart: { ...CHART, type: 'line' },
      })
    })

    it('gives a card without a chart a table when its first query is written by hand', async () => {
      cards.getCard.mockResolvedValue(card({ status: 'failed', sql: null, chart: null, error: 'Try again.' }))
      cards.updateCard.mockResolvedValue(card())
      runChartQuery.mockResolvedValue({ columns: COLUMNS, rows: ROWS, truncated: false })

      const res = await request(app).put(`/cards/${CARD_ID}`).send({ sql: QUERY })

      expect(res.status).toBe(200)
      expect(cards.updateCard).toHaveBeenCalledWith(CARD_ID, 7, { sql: QUERY, chart: TABLE })
    })

    it('stores a chart as it was sent when the query does not change', async () => {
      const chart = { ...CHART, type: 'area', stacked: true }
      cards.getCard.mockResolvedValue(card())
      cards.updateCard.mockResolvedValue(card({ chart }))

      const res = await request(app).put(`/cards/${CARD_ID}`).send({ sql: QUERY, chart })

      expect(res.status).toBe(200)
      expect(cards.updateCard).toHaveBeenCalledWith(CARD_ID, 7, { chart })
      expect(runChartQuery).not.toHaveBeenCalled()
    })

    it('returns 422 with the message of the database and saves nothing when the new query fails', async () => {
      cards.getCard.mockResolvedValue(card())
      runChartQuery.mockRejectedValue(new FakeQueryError('syntax error at or near "FORM"'))

      const res = await request(app).put(`/cards/${CARD_ID}`).send({ sql: 'SELECT 1 FORM orders' })

      expect(res.status).toBe(422)
      expect(res.body).toEqual({ error: 'syntax error at or near "FORM"' })
      expect(cards.updateCard).not.toHaveBeenCalled()
      expect(consoleError).not.toHaveBeenCalled()
    })

    it.each([
      { kind: 'an empty body', body: {}, error: 'Send a title, a query or a chart to change.' },
      {
        kind: 'only null fields',
        body: { title: null, chart: null },
        error: 'Send a title, a query or a chart to change.',
      },
      { kind: 'a blank title', body: { title: '  ' }, error: 'Write a title.' },
      { kind: 'a long title', body: { title: 't'.repeat(121) }, error: 'The title is too long (max 120 characters).' },
      { kind: 'a blank query', body: { sql: '' }, error: 'Write a query.' },
      {
        kind: 'a long query',
        body: { sql: 's'.repeat(20_001) },
        error: 'The query is too long (max 20000 characters).',
      },
      { kind: 'a chart that is not an object', body: { chart: 'bar' }, error: 'The chart must be an object.' },
      {
        kind: 'a chart of an unknown type',
        body: { chart: { type: 'donut' } },
        error: 'The chart type must be one of: bar, row, line, area, pie, number, table.',
      },
    ])('rejects $kind', async ({ body, error }) => {
      const res = await request(app).put(`/cards/${CARD_ID}`).send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error })
      expect(cards.getCard).not.toHaveBeenCalled()
    })

    it('rejects an invalid card id', async () => {
      const res = await request(app).put('/cards/42').send({ title: 'Weekly returns' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Invalid chart ID.' })
    })

    it('returns 404 when the card is missing or not accessible', async () => {
      cards.getCard.mockResolvedValue(null)

      const res = await request(app).put(`/cards/${CARD_ID}`).send({ title: 'Weekly returns' })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Chart not found.' })
      expect(cards.getCard).toHaveBeenCalledWith(CARD_ID, 7)
      expect(cards.updateCard).not.toHaveBeenCalled()
    })

    it('returns 409 while the card is generating', async () => {
      cards.getCard.mockResolvedValue(generatingCard())

      const res = await request(app).put(`/cards/${CARD_ID}`).send({ sql: QUERY })

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: GENERATING_ERROR })
      expect(runChartQuery).not.toHaveBeenCalled()
      expect(cards.updateCard).not.toHaveBeenCalled()
    })

    it('returns 409 when a chart is sent for a card that has no query', async () => {
      cards.getCard.mockResolvedValue(card({ status: 'failed', sql: null, chart: null }))

      const res = await request(app).put(`/cards/${CARD_ID}`).send({ chart: CHART })

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: NO_QUERY_ERROR })
      expect(cards.updateCard).not.toHaveBeenCalled()
    })

    it('returns 409 when a generation starts before the edit is saved', async () => {
      cards.getCard.mockResolvedValueOnce(card()).mockResolvedValueOnce(generatingCard())
      cards.updateCard.mockResolvedValue(null)

      const res = await request(app).put(`/cards/${CARD_ID}`).send({ title: 'Weekly returns' })

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: GENERATING_ERROR })
    })

    it('returns 404 when the card is deleted before the edit is saved', async () => {
      cards.getCard.mockResolvedValueOnce(card()).mockResolvedValueOnce(null)
      cards.updateCard.mockResolvedValue(null)

      const res = await request(app).put(`/cards/${CARD_ID}`).send({ title: 'Weekly returns' })

      expect(res.status).toBe(404)
    })

    it('returns 500 with a generic message on an unexpected failure', async () => {
      cards.getCard.mockRejectedValue(new Error('db down: host db-1.internal'))

      const res = await request(app).put(`/cards/${CARD_ID}`).send({ title: 'Weekly returns' })

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to save the chart.' })
      expect(consoleError).toHaveBeenCalledTimes(1)
    })
  })

  describe('DELETE /cards/:id', () => {
    it('deletes a card the user can open and cancels its generation', async () => {
      cards.deleteCard.mockResolvedValue(true)

      const res = await request(app).delete(`/cards/${CARD_ID}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(cards.deleteCard).toHaveBeenCalledTimes(1)
      expect(cards.deleteCard).toHaveBeenCalledWith(CARD_ID, 7)
      expect(cancelGeneration).toHaveBeenCalledTimes(1)
      expect(cancelGeneration).toHaveBeenCalledWith(CARD_ID)
    })

    it('returns 404 and cancels nothing when the card is missing or not accessible', async () => {
      cards.deleteCard.mockResolvedValue(false)

      const res = await request(app).delete(`/cards/${CARD_ID}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Chart not found.' })
      expect(cancelGeneration).not.toHaveBeenCalled()
    })

    it('rejects an invalid card id', async () => {
      const res = await request(app).delete('/cards/nope')

      expect(res.status).toBe(400)
      expect(cards.deleteCard).not.toHaveBeenCalled()
    })

    it('returns 500 when the delete fails', async () => {
      cards.deleteCard.mockRejectedValue(new Error('db down'))

      const res = await request(app).delete(`/cards/${CARD_ID}`)

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to delete the chart.' })
    })
  })

  describe('GET /cards/:id/data', () => {
    it('serves the result of the card query cache-first, with the moment it was fetched', async () => {
      cards.getCard.mockResolvedValue(card())
      readChartQuery.mockResolvedValue(DATA)

      const res = await request(app).get(`/cards/${CARD_ID}/data`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ columns: COLUMNS, rows: ROWS, truncated: false, fetchedAt: FETCHED_AT })
      expect(cards.getCard).toHaveBeenCalledWith(CARD_ID, 7)
      expect(readChartQuery).toHaveBeenCalledTimes(1)
      expect(readChartQuery).toHaveBeenCalledWith(QUERY)
      expect(runChartQuery).not.toHaveBeenCalled()
    })

    it('runs the query again when asked for fresh data', async () => {
      const refreshed = { ...DATA, fetchedAt: '2026-11-12T10:09:30.000Z' }
      cards.getCard.mockResolvedValue(card())
      runChartQuery.mockResolvedValue(refreshed)

      const res = await request(app).get(`/cards/${CARD_ID}/data?fresh=true`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual(refreshed)
      expect(runChartQuery).toHaveBeenCalledTimes(1)
      expect(runChartQuery).toHaveBeenCalledWith(QUERY)
      expect(readChartQuery).not.toHaveBeenCalled()
    })

    it.each(['false', '1', 'TRUE', '', 'true&fresh=true'])('reads cache-first when fresh is "%s"', async fresh => {
      cards.getCard.mockResolvedValue(card())
      readChartQuery.mockResolvedValue(DATA)

      const res = await request(app).get(`/cards/${CARD_ID}/data?fresh=${fresh}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual(DATA)
      expect(readChartQuery).toHaveBeenCalledTimes(1)
      expect(runChartQuery).not.toHaveBeenCalled()
    })

    it('returns 404 when the card is missing or not accessible', async () => {
      cards.getCard.mockResolvedValue(null)

      const res = await request(app).get(`/cards/${CARD_ID}/data?fresh=true`)

      expect(res.status).toBe(404)
      expect(runChartQuery).not.toHaveBeenCalled()
      expect(readChartQuery).not.toHaveBeenCalled()
    })

    it('returns 409 when the card has no query yet', async () => {
      cards.getCard.mockResolvedValue(generatingCard())

      const res = await request(app).get(`/cards/${CARD_ID}/data`)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: NO_QUERY_ERROR })
      expect(runChartQuery).not.toHaveBeenCalled()
      expect(readChartQuery).not.toHaveBeenCalled()
    })

    it.each([
      { kind: 'a cache-first read', path: 'data', load: readChartQuery },
      { kind: 'a fresh read', path: 'data?fresh=true', load: runChartQuery },
    ])('returns 422 with the message of the query error on $kind', async ({ path, load }) => {
      cards.getCard.mockResolvedValue(card())
      load.mockRejectedValue(new FakeQueryError('relation "returns" does not exist'))

      const res = await request(app).get(`/cards/${CARD_ID}/${path}`)

      expect(res.status).toBe(422)
      expect(res.body).toEqual({ error: 'relation "returns" does not exist' })
      expect(consoleError).not.toHaveBeenCalled()
    })

    it('returns 500 with a generic message on an unexpected failure', async () => {
      cards.getCard.mockResolvedValue(card())
      readChartQuery.mockRejectedValue(new TypeError('boom'))

      const res = await request(app).get(`/cards/${CARD_ID}/data`)

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to load the chart data.' })
      expect(consoleError).toHaveBeenCalledTimes(1)
    })
  })

  describe('POST /query', () => {
    it('always runs the query and returns it with its fetch time and the chart reconciled against its columns', async () => {
      runChartQuery.mockResolvedValue({ ...DATA, truncated: true })

      const res = await request(app)
        .post('/query')
        .send({ sql: ` ${QUERY} `, chart: { type: 'line', xKey: 'day', series: [{ key: 'missing' }], stacked: true } })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        columns: COLUMNS,
        rows: ROWS,
        truncated: true,
        fetchedAt: FETCHED_AT,
        chart: { ...CHART, type: 'line' },
      })
      expect(runChartQuery).toHaveBeenCalledTimes(1)
      expect(runChartQuery).toHaveBeenCalledWith(QUERY)
      expect(readChartQuery).not.toHaveBeenCalled()
    })

    it.each([
      { kind: 'a null chart', body: { sql: QUERY, chart: null } },
      { kind: 'no chart', body: { sql: QUERY } },
    ])('answers $kind with a table', async ({ body }) => {
      runChartQuery.mockResolvedValue({ columns: COLUMNS, rows: ROWS, truncated: false })

      const res = await request(app).post('/query').send(body)

      expect(res.status).toBe(200)
      expect(res.body.chart).toEqual(TABLE)
    })

    it.each([
      { kind: 'a missing query', body: { chart: CHART }, error: 'Write a query.' },
      {
        kind: 'a long query',
        body: { sql: 's'.repeat(20_001) },
        error: 'The query is too long (max 20000 characters).',
      },
      { kind: 'a malformed chart', body: { sql: QUERY, chart: [CHART] }, error: 'The chart must be an object.' },
    ])('rejects $kind', async ({ body, error }) => {
      const res = await request(app).post('/query').send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error })
      expect(runChartQuery).not.toHaveBeenCalled()
    })

    it('returns 422 with the message of the query error', async () => {
      runChartQuery.mockRejectedValue(new FakeQueryError('Only SELECT and WITH (CTE) queries are allowed.'))

      const res = await request(app).post('/query').send({ sql: 'DROP TABLE orders', chart: null })

      expect(res.status).toBe(422)
      expect(res.body).toEqual({ error: 'Only SELECT and WITH (CTE) queries are allowed.' })
      expect(consoleError).not.toHaveBeenCalled()
    })

    it('returns 500 with a generic message on an unexpected failure', async () => {
      runChartQuery.mockRejectedValue(new TypeError('boom'))

      const res = await request(app).post('/query').send({ sql: QUERY })

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to run the query.' })
      expect(consoleError).toHaveBeenCalledTimes(1)
    })
  })
})
