import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetShortcutToken = vi.fn(async () => 'test-shortcut-token')
const mockIsShortcutConfigured = vi.fn(async () => true)
vi.mock('./settings.js', () => ({
  getShortcutToken: (...args) => mockGetShortcutToken(...args),
  isShortcutConfigured: (...args) => mockIsShortcutConfigured(...args),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

const { getStory, searchStories, isConfigured } = await import('./client.js')

function mockResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

describe('isConfigured', () => {
  it('reflects whether a token is stored in the database', async () => {
    expect(await isConfigured()).toBe(true)

    mockIsShortcutConfigured.mockResolvedValueOnce(false)
    expect(await isConfigured()).toBe(false)
  })
})

describe('request token resolution', () => {
  it('throws a clear error when the token is not configured', async () => {
    mockGetShortcutToken.mockResolvedValueOnce(null)
    await expect(getStory(1)).rejects.toThrow('Shortcut token not configured')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('sends the stored token on every request', async () => {
    mockFetch.mockResolvedValue(mockResponse({ id: 1, name: 'Story' }))
    await getStory(1)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/stories/1'),
      expect.objectContaining({ headers: expect.objectContaining({ 'Shortcut-Token': 'test-shortcut-token' }) })
    )
  })
})

describe('getStory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns formatted story', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        id: 1234,
        name: 'Add login page',
        description: 'Create a login form',
        story_type: 'feature',
        workflow_state_id: 1,
        epic_id: 10,
        labels: [{ name: 'frontend' }, { name: 'auth' }],
        owner_ids: ['user-1'],
        tasks: [
          { description: 'Design form', complete: true },
          { description: 'Add validation', complete: false },
        ],
        estimate: 3,
        deadline: '2024-02-01',
        app_url: 'https://app.shortcut.com/story/1234',
      })
    )

    const story = await getStory(1234)
    expect(story.id).toBe(1234)
    expect(story.name).toBe('Add login page')
    expect(story.labels).toEqual(['frontend', 'auth'])
    expect(story.tasks).toEqual([
      { description: 'Design form', complete: true },
      { description: 'Add validation', complete: false },
    ])
    expect(story.estimate).toBe(3)
  })

  it('handles missing optional fields', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        id: 5,
        name: 'Simple task',
        description: null,
        story_type: 'chore',
        workflow_state_id: 1,
        epic_id: null,
        labels: null,
        owner_ids: null,
        tasks: null,
        estimate: null,
        deadline: null,
        app_url: '',
      })
    )

    const story = await getStory(5)
    expect(story.description).toBe('')
    expect(story.labels).toEqual([])
    expect(story.tasks).toEqual([])
  })

  it('throws on API error', async () => {
    mockFetch.mockResolvedValue(mockResponse({ message: 'Not found' }, false, 404))
    await expect(getStory(9999)).rejects.toThrow('Shortcut API')
  })
})

describe('searchStories', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns formatted search results', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        total: 2,
        data: [
          { id: 1, name: 'Story A', story_type: 'feature', app_url: 'https://shortcut.com/1' },
          { id: 2, name: 'Story B', story_type: 'bug', app_url: 'https://shortcut.com/2' },
        ],
      })
    )

    const result = await searchStories('auth')
    expect(result.total).toBe(2)
    expect(result.stories.length).toBe(2)
    expect(result.stories[0].name).toBe('Story A')
  })

  it('limits to 10 results', async () => {
    const data = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      name: `Story ${i}`,
      story_type: 'feature',
      app_url: '',
    }))
    mockFetch.mockResolvedValue(mockResponse({ total: 15, data }))

    const result = await searchStories('test')
    expect(result.stories.length).toBe(10)
  })

  it('handles empty results', async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: [] }))
    const result = await searchStories('nothing')
    expect(result.total).toBe(0)
    expect(result.stories).toEqual([])
  })
})
