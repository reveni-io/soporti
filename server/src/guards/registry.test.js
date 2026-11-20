import { describe, it, expect, vi, beforeEach } from 'vitest'

const getJevDocument = vi.fn()
vi.mock('../db/jev-documents.js', () => ({ getJevDocument }))

const isConfigured = vi.fn()
const areJevCallsEnabled = vi.fn()
vi.mock('../jev/settings.js', () => ({ isConfigured, areJevCallsEnabled }))

const { listChatGuards, listGuards } = await import('./registry.js')

function set(overrides = {}) {
  return {
    description: '',
    model: 'jev-latest',
    minConfidence: 0.7,
    timeoutSeconds: 30,
    dailyLimit: 0,
    questions: [{ id: 'q1' }],
    ...overrides,
  }
}

const LEGAL = {
  id: 'legal',
  rev: 4,
  setVersion: 3,
  data: { set: set({ description: 'Customer replies' }) },
}
const GITHUB = { id: 'github', rev: 2, setVersion: 1, data: { set: set(), repos: [] } }
const DOCUMENTS = { legal: LEGAL, github: GITHUB }

beforeEach(() => {
  vi.clearAllMocks()
  getJevDocument.mockImplementation(async id => DOCUMENTS[id] ?? null)
  isConfigured.mockResolvedValue(true)
  areJevCallsEnabled.mockResolvedValue(true)
})

describe('listGuards', () => {
  it('lists the Legal and the GitHub PRs guards', async () => {
    expect(await listGuards()).toEqual([
      {
        id: 'legal',
        name: 'Legal',
        description: 'Customer replies',
        questions: 1,
        model: 'jev-latest',
        setVersion: 3,
      },
      {
        id: 'github',
        name: 'GitHub PRs',
        description: '',
        questions: 1,
        model: 'jev-latest',
        setVersion: 1,
      },
    ])
  })

  it('shows a guard that was never saved with its defaults', async () => {
    getJevDocument.mockResolvedValue(null)

    const [legal] = await listGuards()

    expect(legal).toMatchObject({ id: 'legal', questions: 0, model: '', setVersion: 0 })
  })
})

describe('listChatGuards', () => {
  it('offers the Legal guard once it has questions and a model, never the GitHub one', async () => {
    expect((await listChatGuards()).map(guard => guard.name)).toEqual(['Legal'])

    getJevDocument.mockImplementation(async id =>
      id === 'legal' ? { ...LEGAL, data: { ...LEGAL.data, set: set({ questions: [] }) } } : DOCUMENTS[id]
    )
    expect(await listChatGuards()).toEqual([])
  })

  it('offers none while the Jev calls are off or there is no key', async () => {
    areJevCallsEnabled.mockResolvedValueOnce(false)
    expect(await listChatGuards()).toEqual([])

    isConfigured.mockResolvedValueOnce(false)
    expect(await listChatGuards()).toEqual([])
  })
})
