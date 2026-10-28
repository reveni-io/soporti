import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const prepareExperiment = vi.fn()
const startExperiment = vi.fn()
let slotTaken = false
const claimExperimentSlot = vi.fn(() => {
  if (slotTaken) return false
  slotTaken = true
  return true
})
const releaseExperimentSlot = vi.fn(() => {
  slotTaken = false
})
vi.mock('../experiments/runner.js', () => ({
  claimExperimentSlot,
  prepareExperiment,
  releaseExperimentSlot,
  startExperiment,
}))

const { default: experimentsRouter } = await import('./experiments.js')

const PLAN = {
  dataset: 'support-questions',
  items: [{ id: 'item-1' }, { id: 'item-2' }],
  skipped: ['item-3'],
  runs: [
    { runName: 'ab [baseline] 2026-10-28T12:00:00', key: 'baseline', promptVersion: null, overrides: null },
    {
      runName: 'ab [compact] 2026-10-28T12:00:00',
      key: 'compact',
      promptVersion: 5,
      overrides: { sections: { core_guidelines: 'x' }, tools: { search_code: 'y' } },
    },
  ],
}
const BODY = { dataset: 'support-questions', runName: 'ab', variants: [{ baseline: true }, { label: 'compact' }] }

function buildApp({ apiKey = null } = {}) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.user = { id: 1, role: 'admin' }
    if (apiKey) req.apiKey = apiKey
    next()
  })
  app.use('/api/admin/experiments', experimentsRouter)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  slotTaken = false
  prepareExperiment.mockResolvedValue({ value: PLAN })
})

describe('POST /api/admin/experiments', () => {
  it('starts the experiment in the background and describes each run', async () => {
    const res = await request(buildApp()).post('/api/admin/experiments').send(BODY)

    expect(res.status).toBe(202)
    expect(res.body).toEqual({
      dataset: 'support-questions',
      items: 2,
      skippedItems: ['item-3'],
      runs: [
        {
          runName: PLAN.runs[0].runName,
          variant: 'baseline',
          promptVersion: null,
          overriddenSections: [],
          overriddenTools: [],
        },
        {
          runName: PLAN.runs[1].runName,
          variant: 'compact',
          promptVersion: 5,
          overriddenSections: ['core_guidelines'],
          overriddenTools: ['search_code'],
        },
      ],
    })
    expect(prepareExperiment).toHaveBeenCalledWith(BODY)
    expect(startExperiment).toHaveBeenCalledWith(PLAN)
    expect(slotTaken).toBe(true)
  })

  it.each([
    { kind: 'no dataset', body: { ...BODY, dataset: ' ' } },
    { kind: 'a run name with a slash', body: { ...BODY, runName: 'a/b' } },
    { kind: 'no variants', body: { ...BODY, variants: [] } },
    { kind: 'three variants', body: { ...BODY, variants: [{ baseline: true }, { label: 'a' }, { label: 'b' }] } },
    { kind: 'the same variant twice', body: { ...BODY, variants: [{ label: 'compact' }, { label: 'compact' }] } },
    { kind: 'two baselines', body: { ...BODY, variants: [{ baseline: true }, { baseline: true }] } },
    { kind: 'a variant with a label and a version', body: { ...BODY, variants: [{ label: 'compact', version: 2 }] } },
    { kind: 'a label with spaces', body: { ...BODY, variants: [{ label: 'my label' }] } },
    { kind: 'a version that is not a whole number', body: { ...BODY, variants: [{ version: 1.5 }] } },
    { kind: 'a variant that is not an object', body: { ...BODY, variants: ['compact'] } },
    { kind: 'an empty variant', body: { ...BODY, variants: [{}] } },
    { kind: 'a label named like the baseline', body: { ...BODY, variants: [{ label: 'baseline' }] } },
    { kind: 'a label named like a version', body: { ...BODY, variants: [{ label: 'v3' }] } },
    { kind: 'version 0', body: { ...BODY, variants: [{ version: 0 }] } },
    { kind: 'a negative version', body: { ...BODY, variants: [{ version: -1 }] } },
    { kind: 'no run name', body: { dataset: 'support-questions', variants: [{ baseline: true }] } },
    { kind: 'an empty body', body: {} },
  ])('rejects $kind with 400 before touching Langfuse', async ({ body }) => {
    const res = await request(buildApp()).post('/api/admin/experiments').send(body)

    expect(res.status).toBe(400)
    expect(prepareExperiment).not.toHaveBeenCalled()
    expect(slotTaken).toBe(false)
  })

  it('trims the dataset name and accepts a version and a label that only start like reserved names', async () => {
    await request(buildApp())
      .post('/api/admin/experiments')
      .send({ ...BODY, dataset: ' support-questions ', variants: [{ version: 1 }, { label: 'v2-compact' }] })

    expect(prepareExperiment).toHaveBeenCalledWith({
      dataset: 'support-questions',
      runName: 'ab',
      variants: [{ version: 1 }, { label: 'v2-compact' }],
    })
  })

  it('rejects API keys, even an admin one', async () => {
    const res = await request(buildApp({ apiKey: { id: 3, sources: [] } }))
      .post('/api/admin/experiments')
      .send(BODY)

    expect(res.status).toBe(403)
    expect(prepareExperiment).not.toHaveBeenCalled()
  })

  it('refuses a second experiment while one runs', async () => {
    slotTaken = true

    const res = await request(buildApp()).post('/api/admin/experiments').send(BODY)

    expect(res.status).toBe(409)
    expect(prepareExperiment).not.toHaveBeenCalled()
  })

  it.each([
    { status: 404, error: 'Dataset support-questions not found.' },
    { status: 422, error: 'Configure Langfuse in /admin first.' },
  ])('returns the $status the preparation decided and frees the slot', async ({ status, error }) => {
    prepareExperiment.mockResolvedValue({ status, error })

    const res = await request(buildApp()).post('/api/admin/experiments').send(BODY)

    expect(res.status).toBe(status)
    expect(res.body.error).toBe(error)
    expect(startExperiment).not.toHaveBeenCalled()
    expect(slotTaken).toBe(false)
  })

  it('answers 500 and frees the slot when the preparation throws', async () => {
    prepareExperiment.mockRejectedValue(Object.assign(new Error('secret body'), { statusCode: 503 }))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(buildApp()).post('/api/admin/experiments').send(BODY)

    expect(res.status).toBe(500)
    expect(res.body.error).not.toContain('secret')
    expect(consoleError).toHaveBeenCalledWith('Failed to start experiment:', 'Error 503')
    expect(slotTaken).toBe(false)
    consoleError.mockRestore()
  })
})
