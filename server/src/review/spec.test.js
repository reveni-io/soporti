import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockShortcutConfigured = vi.fn()
const mockGetStory = vi.fn()

vi.mock('../shortcut/client.js', () => ({
  isConfigured: () => mockShortcutConfigured(),
  getStory: (...args) => mockGetStory(...args),
}))

const { loadSpec } = await import('./spec.js')

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

function story(id) {
  return { id, name: `Story ${id}`, story_type: 'feature', state: 'In Progress', description: 'Do it.', tasks: [] }
}

describe('loadSpec', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockShortcutConfigured.mockResolvedValue(true)
    mockGetStory.mockImplementation(async id => story(id))
  })

  it('fetches up to three stories referenced across the branch name, title and body, in order', async () => {
    const pr = {
      headRef: 'feat/sc-25501-refunds',
      title: 'feat(sc-25501/sc25518/SC-25519): round refunds',
      body: 'Also https://app.shortcut.com/reveni/story/25520/extra',
    }

    const spec = await loadSpec(pr, { logger: silentLogger })

    expect(spec).toEqual({
      configured: true,
      stories: [
        { id: 25501, story: story(25501) },
        { id: 25518, story: story(25518) },
        { id: 25519, story: story(25519) },
      ],
    })
    expect(mockGetStory).toHaveBeenCalledTimes(3)
    expect(mockGetStory.mock.calls).toEqual([[25501], [25518], [25519]])
  })

  it('detects a story URL in the description', async () => {
    const pr = {
      headRef: 'fix/totals',
      title: 'Fix totals',
      body: 'Spec: https://app.shortcut.com/reveni/story/25508/round',
    }

    const spec = await loadSpec(pr, { logger: silentLogger })

    expect(spec.stories).toEqual([{ id: 25508, story: story(25508) }])
    expect(mockGetStory).toHaveBeenCalledTimes(1)
    expect(mockGetStory).toHaveBeenCalledWith(25508)
  })

  it('falls back per story when one of them cannot be fetched', async () => {
    mockGetStory.mockImplementation(async id => {
      if (id === 2) throw new Error('Shortcut API GET /stories/2 failed (404)')
      return story(id)
    })
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

    const spec = await loadSpec({ headRef: 'sc-1', title: 'sc-2', body: '' }, { logger })

    expect(spec.stories).toEqual([
      { id: 1, story: story(1) },
      { id: 2, story: null },
    ])
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('sc-2'))
  })

  it('keeps the references without fetching them when Shortcut is not configured', async () => {
    mockShortcutConfigured.mockResolvedValue(false)

    const spec = await loadSpec(
      { headRef: 'feature/sc-1234-rounding', title: 'x', body: null },
      { logger: silentLogger }
    )

    expect(spec).toEqual({ configured: false, stories: [{ id: 1234, story: null }] })
    expect(mockGetStory).not.toHaveBeenCalled()
  })

  it('finds no story in words that merely contain "sc"', async () => {
    const pr = { headRef: 'fix/desc-12', title: 'Describe parsec99 in the scss', body: 'sc-less flow' }

    const spec = await loadSpec(pr, { logger: silentLogger })

    expect(spec).toEqual({ configured: true, stories: [] })
    expect(mockGetStory).not.toHaveBeenCalled()
  })
})
