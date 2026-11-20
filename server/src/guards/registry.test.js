import { describe, it, expect, vi, beforeEach } from 'vitest'

const getJevDocument = vi.fn()
vi.mock('../db/jev-documents.js', () => ({ getJevDocument }))

const isConfigured = vi.fn()
vi.mock('../jev/settings.js', () => ({ isConfigured }))

const { isGuardSendAllowed, listChatGuards, listGuards } = await import('./registry.js')

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
  data: { enabled: true, set: set({ description: 'Customer replies' }), allowSend: true },
}
const GITHUB = { id: 'github', rev: 2, setVersion: 1, data: { enabled: true, set: set(), repos: [] } }
const DOCUMENTS = { legal: LEGAL, github: GITHUB }

beforeEach(() => {
  vi.clearAllMocks()
  getJevDocument.mockImplementation(async id => DOCUMENTS[id] ?? null)
  isConfigured.mockResolvedValue(true)
})

describe('listGuards', () => {
  it('lists the Legal and the GitHub PRs guards', async () => {
    expect(await listGuards()).toEqual([
      {
        id: 'legal',
        name: 'Legal',
        enabled: true,
        description: 'Customer replies',
        questions: 1,
        model: 'jev-latest',
        setVersion: 3,
        allowSend: true,
      },
      {
        id: 'github',
        name: 'GitHub PRs',
        enabled: true,
        description: '',
        questions: 1,
        model: 'jev-latest',
        setVersion: 1,
        allowSend: null,
      },
    ])
  })

  it('shows a guard that was never saved with its defaults', async () => {
    getJevDocument.mockResolvedValue(null)

    const [legal] = await listGuards()

    expect(legal).toMatchObject({
      id: 'legal',
      enabled: false,
      questions: 0,
      model: '',
      setVersion: 0,
      allowSend: false,
    })
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

  it('offers none while the calls of the guard are off or there is no key', async () => {
    getJevDocument.mockImplementation(async id =>
      id === 'legal' ? { ...LEGAL, data: { ...LEGAL.data, enabled: false } } : DOCUMENTS[id]
    )
    expect(await listChatGuards()).toEqual([])

    getJevDocument.mockImplementation(async id => DOCUMENTS[id])
    isConfigured.mockResolvedValueOnce(false)
    expect(await listChatGuards()).toEqual([])
  })
})

describe('isGuardSendAllowed', () => {
  it('follows the sending switch of the guard', async () => {
    expect(await isGuardSendAllowed('legal')).toBe(true)
    expect(await isGuardSendAllowed('github')).toBe(false)
  })
})
