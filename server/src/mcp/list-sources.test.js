import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../github/client.js', () => ({ listRepos: vi.fn() }))
vi.mock('../integrations/catalog.js', () => ({
  listConfiguredIntegrations: vi.fn(),
  GITHUB_INTEGRATION_ID: 'github',
}))

const { listRepos } = await import('../github/client.js')
const { listConfiguredIntegrations } = await import('../integrations/catalog.js')
const { executeListSources } = await import('./list-sources.js')

const REPOS = [
  { fullName: 'reveni-io/soporti', description: 'The assistant', language: 'JavaScript', defaultBranch: 'main' },
  { fullName: 'reveni-io/api', description: '', language: null, defaultBranch: 'master' },
]

const INTEGRATIONS = [
  { id: 'github', name: 'GitHub', description: 'Explore repositories', selectable: false },
  { id: 'notion', name: 'Notion', description: 'Search and read Notion pages', selectable: true },
  { id: 'postgres', name: 'Database', description: 'Query the database', selectable: true },
  { id: 'sentry', name: 'Sentry', description: 'Inspect production errors', selectable: false },
]

beforeEach(() => {
  vi.clearAllMocks()
  listRepos.mockResolvedValue(REPOS)
  listConfiguredIntegrations.mockResolvedValue(INTEGRATIONS)
})

describe('executeListSources', () => {
  it('lists every repo and integration when the key has no scope', async () => {
    const sources = await executeListSources({ userId: 7, scope: [] })

    expect(sources.repos).toEqual([
      { source: 'reveni-io/soporti', description: 'The assistant', language: 'JavaScript' },
      { source: 'reveni-io/api', description: '', language: null },
    ])
    expect(sources.integrations.map(integration => integration.source)).toEqual([
      'integration:notion',
      'integration:postgres',
      'integration:sentry',
    ])
    expect(listConfiguredIntegrations).toHaveBeenCalledWith(7)
  })

  it('describes each integration with the source string the other tools accept', async () => {
    const sources = await executeListSources({ userId: 7, scope: undefined })

    expect(sources.integrations[0]).toEqual({
      source: 'integration:notion',
      name: 'Notion',
      description: 'Search and read Notion pages',
    })
  })

  it('never lists GitHub as an integration, because repos are named directly', async () => {
    const sources = await executeListSources({ userId: 7, scope: [] })

    expect(sources.integrations.map(integration => integration.source)).not.toContain('integration:github')
  })

  it('lists only the sources inside the scope of the key', async () => {
    const sources = await executeListSources({ userId: 7, scope: ['reveni-io/api', 'integration:notion'] })

    expect(sources.repos.map(repo => repo.source)).toEqual(['reveni-io/api'])
    expect(sources.integrations.map(integration => integration.source)).toEqual(['integration:notion'])
  })

  it('never lists a source that ask_soporti would refuse, not even an always-on integration', async () => {
    const sources = await executeListSources({ userId: 7, scope: ['reveni-io/api'] })

    expect(sources.integrations).toEqual([])
  })

  it('lists everything for a key scoped to yolo', async () => {
    const sources = await executeListSources({ userId: 7, scope: ['yolo'] })

    expect(sources.repos.map(repo => repo.source)).toEqual(['reveni-io/soporti', 'reveni-io/api'])
    expect(sources.integrations).toHaveLength(3)
  })

  it('lists no repo when the scope names none', async () => {
    const sources = await executeListSources({ userId: 7, scope: ['integration:postgres'] })

    expect(sources.repos).toEqual([])
    expect(sources.integrations.map(integration => integration.source)).toEqual(['integration:postgres'])
  })
})
