import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRun = vi.fn()
const agentConstructorArgs = vi.fn()

vi.mock('@openai/agents', () => ({
  Agent: class {
    constructor(opts) {
      agentConstructorArgs(opts)
      Object.assign(this, opts)
    }
  },
  run: (...args) => mockRun(...args),
}))

const mockResolveModelForAgent = vi.fn(async () => 'gpt-test')
const mockCodexModelSettings = vi.fn(() => null)
vi.mock('../openai/client.js', () => ({
  resolveModelForAgent: (...args) => mockResolveModelForAgent(...args),
  codexModelSettings: (...args) => mockCodexModelSettings(...args),
}))

vi.mock('../agent/tools.js', () => ({
  listDatabaseSchemasTool: { name: 'list_database_schemas' },
  listDatabaseTablesTool: { name: 'list_database_tables' },
  describeDatabaseTableTool: { name: 'describe_database_table' },
}))

const { draftShopifyTokenQuery } = await import('./query-drafter.js')

const SQL =
  "SELECT s.domain, t.token FROM stores s JOIN tokens t ON t.store_id = s.id WHERE s.domain ILIKE '%' || {{store}} || '%' LIMIT 1"

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveModelForAgent.mockResolvedValue('gpt-test')
  mockCodexModelSettings.mockReturnValue(null)
})

describe('draftShopifyTokenQuery', () => {
  it('returns the drafted query', async () => {
    mockRun.mockResolvedValue({ finalOutput: SQL })

    const draft = await draftShopifyTokenQuery()

    expect(draft).toEqual({ found: true, query: SQL })
  })

  it('strips markdown fences from the output', async () => {
    mockRun.mockResolvedValue({ finalOutput: '```sql\n' + SQL + '\n```' })

    const draft = await draftShopifyTokenQuery()

    expect(draft).toEqual({ found: true, query: SQL })
  })

  it('reports when the assistant finds no credentials', async () => {
    mockRun.mockResolvedValue({ finalOutput: 'NOT_FOUND: no table with Shopify tokens was found.' })

    const draft = await draftShopifyTokenQuery()

    expect(draft.found).toBe(false)
    expect(draft.explanation).toBe('no table with Shopify tokens was found.')
  })

  it('reports when the assistant returns nothing', async () => {
    mockRun.mockResolvedValue({ finalOutput: '' })

    const draft = await draftShopifyTokenQuery()

    expect(draft.found).toBe(false)
    expect(draft.explanation).toContain('no query')
  })

  it('gives the agent only the schema tools (never query_database)', async () => {
    mockRun.mockResolvedValue({ finalOutput: SQL })

    await draftShopifyTokenQuery()

    const { tools } = agentConstructorArgs.mock.calls[0][0]
    expect(tools.map(t => t.name)).toEqual(['list_database_schemas', 'list_database_tables', 'describe_database_table'])
  })

  it('propagates the "OpenAI not configured" error from model resolution', async () => {
    mockResolveModelForAgent.mockRejectedValue(new Error('No OpenAI model configured — set it in /admin.'))

    await expect(draftShopifyTokenQuery()).rejects.toThrow('No OpenAI model configured')
    expect(mockRun).not.toHaveBeenCalled()
  })
})
