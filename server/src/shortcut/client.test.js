import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetShortcutToken = vi.fn(async () => 'test-shortcut-token')
const mockIsShortcutConfigured = vi.fn(async () => true)
vi.mock('./settings.js', () => ({
  getShortcutToken: (...args) => mockGetShortcutToken(...args),
  isShortcutConfigured: (...args) => mockIsShortcutConfigured(...args),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

const {
  getStory,
  searchStories,
  listIterations,
  getIterationStories,
  listEpics,
  listMembers,
  isConfigured,
  _resetShortcutClientCachesForTests,
} = await import('./client.js')

const API_ROOT = 'https://api.app.shortcut.com/api/v3'

const WORKFLOWS = [
  {
    states: [
      { id: 500, name: 'Ready for Dev' },
      { id: 501, name: 'In Progress' },
      { id: 502, name: 'Done' },
    ],
  },
]

const MEMBERS = [
  { id: 'user-1', role: 'member', profile: { name: 'Sergio Zam', mention_name: 'sergio' } },
  { id: 'user-2', role: 'owner', profile: { name: 'Ana Ruiz', mention_name: 'ana' } },
  { id: 'user-3', role: 'member', disabled: true, profile: { name: 'Former Teammate', mention_name: 'former' } },
]

const EPICS = [
  {
    id: 10,
    name: 'Checkout redesign',
    started: true,
    deadline: '2026-09-01',
    stats: { num_stories_unstarted: 1, num_stories_started: 2, num_stories_done: 3 },
    app_url: 'https://app.shortcut.com/epic/10',
  },
  { id: 11, name: 'Billing', started: true, completed: true, deadline: null, stats: {} },
  { id: 12, name: 'Alerts', deadline: null, stats: { num_stories_unstarted: 4 } },
]

const ITERATIONS = [
  { id: 70, name: 'Sprint 11', status: 'done', start_date: '2026-07-01', end_date: '2026-07-14' },
  { id: 71, name: 'Sprint 12', status: 'started', start_date: '2026-07-15', end_date: '2026-07-28' },
  { id: 72, name: 'Sprint 13', status: 'unstarted', start_date: '2026-07-29', end_date: '2026-08-11' },
]

const LOOKUP_ROUTES = [
  ['/workflows', WORKFLOWS],
  ['/members', MEMBERS],
  ['/epics', EPICS],
  ['/iterations/71', ITERATIONS[1]],
  ['/iterations', ITERATIONS],
]

function jsonResponse(data) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) }
}

function toPath(url) {
  return String(url).replace(API_ROOT, '')
}

function mockApi(routes = []) {
  const all = [...routes, ...LOOKUP_ROUTES]
  mockFetch.mockImplementation(async url => {
    const path = toPath(url)
    const match = all.find(([prefix]) => path.startsWith(prefix))
    if (!match) throw new Error(`Unexpected Shortcut request: ${path}`)

    return jsonResponse(match[1])
  })
}

function requestedPaths() {
  return mockFetch.mock.calls.map(([url]) => toPath(url))
}

beforeEach(() => {
  vi.clearAllMocks()
  _resetShortcutClientCachesForTests()
  mockGetShortcutToken.mockResolvedValue('test-shortcut-token')
  mockIsShortcutConfigured.mockResolvedValue(true)
})

describe('isConfigured', () => {
  it('reflects whether a token is stored in the database', async () => {
    expect(await isConfigured()).toBe(true)

    mockIsShortcutConfigured.mockResolvedValueOnce(false)
    expect(await isConfigured()).toBe(false)
  })
})

describe('request token resolution', () => {
  it('throws a clear error when the token is not configured', async () => {
    mockGetShortcutToken.mockResolvedValue(null)

    await expect(getStory(1)).rejects.toThrow('Shortcut token not configured')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('sends the stored token on every request', async () => {
    mockApi([['/stories/1', { id: 1, name: 'Story' }]])

    await getStory(1)

    expect(mockFetch.mock.calls.length).toBeGreaterThan(1)
    for (const [, options] of mockFetch.mock.calls) {
      expect(options.headers['Shortcut-Token']).toBe('test-shortcut-token')
    }
  })
})

describe('getStory', () => {
  it('resolves state, owners, epic and iteration into names', async () => {
    mockApi([
      [
        '/stories/1234',
        {
          id: 1234,
          name: 'Add login page',
          description: 'Create a login form',
          story_type: 'feature',
          workflow_state_id: 501,
          epic_id: 10,
          iteration_id: 71,
          owner_ids: ['user-2'],
          labels: [{ name: 'frontend' }, { name: 'auth' }],
          tasks: [
            { description: 'Design form', complete: true },
            { description: 'Add validation', complete: false },
          ],
          estimate: 3,
          deadline: '2026-02-01',
          updated_at: '2026-01-20T10:00:00Z',
          app_url: 'https://app.shortcut.com/story/1234',
        },
      ],
    ])

    const story = await getStory(1234)

    expect(story.state).toBe('In Progress')
    expect(story.owners).toEqual(['Ana Ruiz'])
    expect(story.epic).toBe('Checkout redesign')
    expect(story.iteration).toBe('Sprint 12')
    expect(story.labels).toEqual(['frontend', 'auth'])
    expect(story.description).toBe('Create a login form')
    expect(story.tasks).toEqual([
      { description: 'Design form', complete: true },
      { description: 'Add validation', complete: false },
    ])
    expect(story.estimate).toBe(3)
  })

  it('handles missing optional fields', async () => {
    mockApi([
      [
        '/stories/5',
        {
          id: 5,
          name: 'Simple task',
          description: null,
          story_type: 'chore',
          workflow_state_id: 999,
          epic_id: null,
          iteration_id: null,
          owner_ids: null,
          labels: null,
          tasks: null,
          estimate: null,
          deadline: null,
          app_url: '',
        },
      ],
    ])

    const story = await getStory(5)

    expect(story.description).toBe('')
    expect(story.labels).toEqual([])
    expect(story.tasks).toEqual([])
    expect(story.owners).toEqual([])
    expect(story.epic).toBeNull()
    expect(story.iteration).toBeNull()
    expect(story.state).toBeNull()
  })

  it('falls back to the raw owner id when the member is unknown', async () => {
    mockApi([['/stories/6', { id: 6, name: 'Orphan', workflow_state_id: 500, owner_ids: ['user-ghost'] }]])

    const story = await getStory(6)

    expect(story.owners).toEqual(['user-ghost'])
  })

  it('throws on API error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}), text: async () => 'Not found' })

    await expect(getStory(9999)).rejects.toThrow('Shortcut API GET /stories/9999 failed (404): Not found')
  })
})

describe('searchStories', () => {
  it('sends the query untouched so search operators survive encoding', async () => {
    mockApi([['/search/stories', { total: 0, data: [] }]])

    await searchStories('owner:sergio !is:done type:bug')

    const search = requestedPaths().find(path => path.startsWith('/search/stories'))
    expect(search).toContain(`query=${encodeURIComponent('owner:sergio !is:done type:bug')}`)
  })

  it('enriches every story and reports how many matched', async () => {
    mockApi([
      [
        '/search/stories',
        {
          total: 2,
          data: [
            {
              id: 1,
              name: 'Story A',
              story_type: 'feature',
              workflow_state_id: 501,
              owner_ids: ['user-1'],
              epic_id: 10,
              iteration_id: 71,
              estimate: 2,
            },
            { id: 2, name: 'Story B', story_type: 'bug', workflow_state_id: 502, blocked: true },
          ],
        },
      ],
    ])

    const result = await searchStories('auth')

    expect(result).toMatchObject({ total: 2, returned: 2, truncated: false })
    expect(result.stories[0]).toMatchObject({
      id: 1,
      state: 'In Progress',
      owners: ['Sergio Zam'],
      epic: 'Checkout redesign',
      iteration: 'Sprint 12',
      estimate: 2,
    })
    expect(result.stories[1]).toMatchObject({ id: 2, state: 'Done', blocked: true })
  })

  it('flags the result as truncated when more stories matched than were returned', async () => {
    mockApi([['/search/stories', { total: 87, data: [{ id: 1, name: 'Story A', workflow_state_id: 501 }] }]])

    const result = await searchStories('sprint', { limit: 1 })

    expect(result).toMatchObject({ total: 87, returned: 1, truncated: true })
  })

  it('follows the next page until the limit is reached', async () => {
    let page = 0
    mockFetch.mockImplementation(async url => {
      const path = toPath(url)
      if (path.startsWith('/search/stories')) {
        page += 1
        return jsonResponse({
          total: 50,
          data: Array.from({ length: 25 }, (_, i) => ({ id: page * 100 + i, name: 'Story', workflow_state_id: 501 })),
          next: page < 2 ? '/api/v3/search/stories?query=x&next=token' : null,
        })
      }

      return jsonResponse(LOOKUP_ROUTES.find(([prefix]) => path.startsWith(prefix))[1])
    })

    const result = await searchStories('x', { limit: 40 })

    expect(page).toBe(2)
    expect(result.returned).toBe(40)
    expect(requestedPaths().filter(p => p.startsWith('/search/stories'))[1]).toBe('/search/stories?query=x&next=token')
  })

  it('defaults to 25 stories and caps an oversized limit', async () => {
    const data = Array.from({ length: 25 }, (_, i) => ({ id: i, name: 'Story', workflow_state_id: 501 }))
    mockApi([['/search/stories', { total: 25, data }]])

    expect((await searchStories('a')).returned).toBe(25)
    expect((await searchStories('a', { limit: 999 })).returned).toBe(25)

    const pageSizes = requestedPaths().filter(p => p.startsWith('/search/stories'))
    expect(pageSizes.every(p => p.includes('page_size=25'))).toBe(true)
  })

  it('handles empty results', async () => {
    mockApi([['/search/stories', { data: [] }]])

    const result = await searchStories('nothing')

    expect(result).toMatchObject({ total: 0, returned: 0, truncated: false })
    expect(result.stories).toEqual([])
  })
})

describe('listIterations', () => {
  it('returns the most recent sprints first', async () => {
    mockApi()

    const result = await listIterations()

    expect(result).toMatchObject({ total: 3, returned: 3, truncated: false })
    expect(result.iterations.map(i => i.name)).toEqual(['Sprint 13', 'Sprint 12', 'Sprint 11'])
    expect(result.iterations[1]).toMatchObject({
      id: 71,
      name: 'Sprint 12',
      status: 'started',
      start_date: '2026-07-15',
      end_date: '2026-07-28',
    })
  })

  it('filters by status so the current sprint can be resolved', async () => {
    mockApi()

    const result = await listIterations({ status: 'started' })

    expect(result.total).toBe(1)
    expect(result.iterations[0].name).toBe('Sprint 12')
  })

  it('flags the list as truncated when there are more sprints than the cap', async () => {
    const many = Array.from({ length: 26 }, (_, i) => ({
      id: i,
      name: `Sprint ${i}`,
      status: 'done',
      start_date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    }))
    mockFetch.mockImplementation(async () => jsonResponse(many))

    const result = await listIterations()

    expect(result).toMatchObject({ total: 26, returned: 20, truncated: true })
  })
})

describe('getIterationStories', () => {
  it('returns every story with a count per workflow state', async () => {
    mockApi([
      [
        '/iterations/71/stories',
        [
          { id: 1, name: 'A', workflow_state_id: 501, owner_ids: ['user-1'], estimate: 3 },
          { id: 2, name: 'B', workflow_state_id: 501, owner_ids: ['user-2'], estimate: 5 },
          { id: 3, name: 'C', workflow_state_id: 502, owner_ids: [] },
        ],
      ],
    ])

    const result = await getIterationStories(71)

    expect(result.iteration).toMatchObject({ id: 71, name: 'Sprint 12', status: 'started' })
    expect(result).toMatchObject({ total: 3, returned: 3, truncated: false })
    expect(result.by_state).toEqual({ 'In Progress': 2, Done: 1 })
    expect(result.stories.map(s => s.owners)).toEqual([['Sergio Zam'], ['Ana Ruiz'], []])
  })

  it('counts stories in an unknown state as unknown', async () => {
    mockApi([['/iterations/71/stories', [{ id: 1, name: 'A', workflow_state_id: 404 }]]])

    const result = await getIterationStories(71)

    expect(result.by_state).toEqual({ unknown: 1 })
  })

  it('truncates a sprint larger than the cap and says so', async () => {
    const stories = Array.from({ length: 205 }, (_, i) => ({ id: i, name: 'Story', workflow_state_id: 501 }))
    mockApi([['/iterations/71/stories', stories]])

    const result = await getIterationStories(71)

    expect(result).toMatchObject({ total: 205, returned: 200, truncated: true })
    expect(result.by_state).toEqual({ 'In Progress': 205 })
  })

  it('handles an empty sprint', async () => {
    mockApi([['/iterations/71/stories', []]])

    const result = await getIterationStories(71)

    expect(result).toMatchObject({ total: 0, returned: 0, truncated: false })
    expect(result.by_state).toEqual({})
  })
})

describe('listEpics', () => {
  it('derives a status from the started and completed flags', async () => {
    mockApi()

    const result = await listEpics()

    expect(result).toMatchObject({ total: 3, returned: 3, truncated: false })
    expect(result.epics.map(e => [e.name, e.status])).toEqual([
      ['Checkout redesign', 'in progress'],
      ['Alerts', 'to do'],
      ['Billing', 'done'],
    ])
  })

  it('exposes the story counts per state', async () => {
    mockApi()

    const result = await listEpics()

    expect(result.epics[0]).toMatchObject({
      id: 10,
      deadline: '2026-09-01',
      stories: { unstarted: 1, started: 2, done: 3 },
    })
    expect(result.epics[2].stories).toEqual({ unstarted: 0, started: 0, done: 0 })
  })

  it('filters by status', async () => {
    mockApi()

    const result = await listEpics({ status: 'done' })

    expect(result).toMatchObject({ total: 1, returned: 1, truncated: false })
    expect(result.epics[0].name).toBe('Billing')
  })

  it('flags the list as truncated when there are more epics than the cap', async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ id: i, name: `Epic ${i}`, stats: {} }))
    mockFetch.mockImplementation(async () => jsonResponse(many))

    const result = await listEpics()

    expect(result).toMatchObject({ total: 51, returned: 50, truncated: true })
  })
})

describe('listMembers', () => {
  it('returns the active members with their mention name', async () => {
    mockApi()

    const result = await listMembers()

    expect(result.total).toBe(2)
    expect(result.members).toEqual([
      { id: 'user-1', name: 'Sergio Zam', mention_name: 'sergio', role: 'member' },
      { id: 'user-2', name: 'Ana Ruiz', mention_name: 'ana', role: 'owner' },
    ])
  })

  it('excludes disabled members', async () => {
    mockApi()

    const result = await listMembers()

    expect(result.members.map(m => m.name)).not.toContain('Former Teammate')
  })
})

describe('lookup caching', () => {
  it('resolves the workflow states and members once across calls', async () => {
    mockApi([['/stories/1', { id: 1, name: 'A', workflow_state_id: 501 }]])

    await getStory(1)
    await getStory(1)

    expect(requestedPaths().filter(p => p === '/workflows')).toHaveLength(1)
    expect(requestedPaths().filter(p => p === '/members')).toHaveLength(1)
  })

  it('refetches the lookups when the stored token changes', async () => {
    mockApi([['/stories/1', { id: 1, name: 'A', workflow_state_id: 501 }]])

    await getStory(1)
    mockGetShortcutToken.mockResolvedValue('rotated-token')
    await getStory(1)

    expect(requestedPaths().filter(p => p === '/workflows')).toHaveLength(2)
  })
})
