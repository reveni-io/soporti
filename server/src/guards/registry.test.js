import { describe, it, expect, vi, beforeEach } from 'vitest'

const getJevDocument = vi.fn()
const listJevDocuments = vi.fn()
const saveJevDocument = vi.fn()
const deleteJevDocument = vi.fn()
vi.mock('../db/jev-documents.js', () => ({ getJevDocument, listJevDocuments, saveJevDocument, deleteJevDocument }))

const isConfigured = vi.fn()
vi.mock('../jev/settings.js', () => ({ isConfigured }))

const { createGuard, deleteGuard, isGuardSendAllowed, listChatGuards, listGuards } = await import('./registry.js')

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
  data: { set: set({ description: 'Customer replies' }), allowSend: true },
}
const GITHUB = { id: 'github', rev: 2, setVersion: 1, data: { set: set(), repos: [] } }
const REFUNDS = { id: 'guard-0a1b2c3d', rev: 1, setVersion: 1, data: { name: 'Refunds', set: set(), allowSend: false } }
const ANSWERS = { id: 'guard-9f8e7d6c', rev: 1, setVersion: 0, data: { name: 'Answers', set: set({ questions: [] }) } }

beforeEach(() => {
  vi.clearAllMocks()
  listJevDocuments.mockResolvedValue([
    { id: 'jev', rev: 1, setVersion: 0, data: { enabled: true } },
    LEGAL,
    GITHUB,
    REFUNDS,
    ANSWERS,
  ])
  getJevDocument.mockResolvedValue({ data: { enabled: true } })
  isConfigured.mockResolvedValue(true)
})

describe('listGuards', () => {
  it('lists the built-in guards first, then the others by name', async () => {
    const guards = await listGuards()

    expect(guards.map(guard => guard.name)).toEqual(['Legal', 'GitHub PRs', 'Answers', 'Refunds'])
    expect(guards[0]).toEqual({
      id: 'legal',
      name: 'Legal',
      builtIn: true,
      description: 'Customer replies',
      questions: 1,
      model: 'jev-latest',
      setVersion: 3,
      allowSend: true,
    })
    expect(guards[1].allowSend).toBeNull()
    expect(guards[3].builtIn).toBe(false)
  })

  it('shows a built-in guard that was never saved with its defaults', async () => {
    listJevDocuments.mockResolvedValue([])

    const [legal, github] = await listGuards()

    expect(legal).toMatchObject({ id: 'legal', questions: 0, model: '', setVersion: 0, allowSend: false })
    expect(github).toMatchObject({ id: 'github', questions: 0 })
  })
})

describe('listChatGuards', () => {
  it('offers the guards with questions and a model, never the GitHub one', async () => {
    expect((await listChatGuards()).map(guard => guard.name)).toEqual(['Legal', 'Refunds'])
  })

  it('offers none while Jev calls are off or there is no key', async () => {
    getJevDocument.mockResolvedValueOnce({ data: { enabled: false } })
    expect(await listChatGuards()).toEqual([])

    isConfigured.mockResolvedValueOnce(false)
    expect(await listChatGuards()).toEqual([])
  })
})

describe('isGuardSendAllowed', () => {
  it('follows the sending switch of the guard', async () => {
    getJevDocument.mockResolvedValueOnce(LEGAL).mockResolvedValueOnce(REFUNDS).mockResolvedValueOnce(null)

    expect(await isGuardSendAllowed('legal')).toBe(true)
    expect(await isGuardSendAllowed('guard-0a1b2c3d')).toBe(false)
    expect(await isGuardSendAllowed('guard-gone0000')).toBe(false)
  })
})

describe('createGuard', () => {
  it('saves a new guard with its name and a fresh id', async () => {
    saveJevDocument.mockImplementation(async (id, { defaults, plan }) => {
      const saved = plan({ id, rev: 0, data: defaults, setVersion: 0 })
      return { document: { id, rev: 1, data: saved.data, setVersion: 0 } }
    })

    const guard = await createGuard('Payments', 'ana@example.com')

    expect(guard).toMatchObject({ name: 'Payments', builtIn: false, questions: 0, allowSend: false })
    expect(guard.id).toMatch(/^guard-[a-f0-9]{8}$/)
    const [id, options] = saveJevDocument.mock.calls[0]
    expect(id).toBe(guard.id)
    expect(options).toMatchObject({ expectedRev: 0, author: 'ana@example.com' })
    expect(options.plan({ rev: 0, data: options.defaults }).change).toBe('Created; Name (empty) → Payments')
  })
})

describe('deleteGuard', () => {
  it('deletes only guards of your own', async () => {
    deleteJevDocument.mockResolvedValue(true)

    expect(await deleteGuard('guard-0a1b2c3d')).toBe(true)
    expect(await deleteGuard('legal')).toBe(false)
    expect(deleteJevDocument).toHaveBeenCalledTimes(1)
  })
})
