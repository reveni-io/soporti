import { describe, it, expect, vi, beforeEach } from 'vitest'

const listJevDocuments = vi.fn()
vi.mock('../db/jev-documents.js', () => ({ listJevDocuments }))

const isConfigured = vi.fn()
vi.mock('../jev/settings.js', () => ({ isConfigured }))

const { findGuardByName, listChatGuards, listGuards } = await import('./registry.js')

function set(overrides = {}) {
  return {
    description: '',
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
const PAYMENTS = {
  id: 'guard-0a1b2c3d',
  rev: 1,
  setVersion: 0,
  data: { name: 'Payments', set: set({ questions: [] }) },
}
const ANALYTICS = { id: 'guard-1a2b3c4d', rev: 1, setVersion: 1, data: { name: 'Analytics', set: set() } }

beforeEach(() => {
  vi.clearAllMocks()
  listJevDocuments.mockResolvedValue([PAYMENTS, LEGAL, GITHUB, ANALYTICS, { id: 'jev', rev: 1, data: {} }])
  isConfigured.mockResolvedValue(true)
})

describe('listGuards', () => {
  it('lists the built-in guards first, then the created ones by name, and nothing else', async () => {
    expect(await listGuards()).toEqual([
      {
        id: 'legal',
        name: 'Legal',
        builtIn: true,
        description: 'Customer replies',
        questions: 1,
        setVersion: 3,
      },
      {
        id: 'github',
        name: 'GitHub PRs',
        builtIn: true,
        description: '',
        questions: 1,
        setVersion: 1,
      },
      {
        id: 'guard-1a2b3c4d',
        name: 'Analytics',
        builtIn: false,
        description: '',
        questions: 1,
        setVersion: 1,
      },
      {
        id: 'guard-0a1b2c3d',
        name: 'Payments',
        builtIn: false,
        description: '',
        questions: 0,
        setVersion: 0,
      },
    ])
  })

  it('shows a built-in guard that was never saved with its defaults', async () => {
    listJevDocuments.mockResolvedValue([])

    expect(await listGuards()).toEqual([
      expect.objectContaining({ id: 'legal', name: 'Legal', questions: 0, setVersion: 0 }),
      expect.objectContaining({ id: 'github', name: 'GitHub PRs' }),
    ])
  })
})

describe('findGuardByName', () => {
  it('finds a guard by its name in any case, leaving one guard out when asked', async () => {
    const guards = await listGuards()

    expect(findGuardByName(guards, ' payments ').id).toBe('guard-0a1b2c3d')
    expect(findGuardByName(guards, 'Payments', { exceptId: 'guard-0a1b2c3d' })).toBeNull()
  })
})

describe('listChatGuards', () => {
  it('offers the guards with questions, never the GitHub one', async () => {
    expect((await listChatGuards()).map(guard => guard.name)).toEqual(['Legal', 'Analytics'])
  })

  it('offers none while there is no key', async () => {
    isConfigured.mockResolvedValueOnce(false)
    expect(await listChatGuards()).toEqual([])
  })
})
