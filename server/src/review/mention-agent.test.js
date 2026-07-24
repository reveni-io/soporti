import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRun = vi.fn()
const MockAgent = vi.fn(function (options) {
  this.options = options
})

vi.mock('@openai/agents', () => ({
  Agent: MockAgent,
  run: mockRun,
  tool: def => def,
}))

vi.mock('../repo-pool/index.js', () => ({
  getDirectoryContents: vi.fn(),
  getFileContents: vi.fn(),
  searchCode: vi.fn(),
  findFiles: vi.fn(),
  gitLogFile: vi.fn(),
  gitBlame: vi.fn(),
  getDirectoryContentsAt: vi.fn(),
  getFileContentsAt: vi.fn(),
  searchCodeAt: vi.fn(),
  findFilesAt: vi.fn(),
  gitLogFileAt: vi.fn(),
  gitBlameAt: vi.fn(),
}))

const mockShortcutConfigured = vi.fn()

vi.mock('../shortcut/client.js', () => ({
  isConfigured: () => mockShortcutConfigured(),
  getStory: vi.fn(),
  searchStories: vi.fn(),
}))
vi.mock('../sentry/client.js', () => ({ isConfigured: () => false, getIssue: vi.fn(), searchIssues: vi.fn() }))
vi.mock('../postgres/client.js', () => ({
  isConfigured: () => false,
  listSchemas: vi.fn(),
  listTables: vi.fn(),
  describeTable: vi.fn(),
  runQuery: vi.fn(),
}))
vi.mock('../notion/client.js', () => ({ isConfigured: () => false, searchPages: vi.fn(), getPage: vi.fn() }))
vi.mock('../helpjuice/client.js', () => ({ isConfigured: () => false, searchArticles: vi.fn(), getArticle: vi.fn() }))
vi.mock('../shopify/client.js', () => ({
  isConfigured: () => false,
  getOrder: vi.fn(),
  searchOrders: vi.fn(),
  getProduct: vi.fn(),
  getWebhooks: vi.fn(),
  graphqlQuery: vi.fn(),
}))
vi.mock('../github/client.js', () => ({ listRepos: vi.fn() }))

vi.mock('../config.js', () => ({
  default: {
    agent: { maxIterations: 7 },
    review: { reasoningEffort: 'high' },
  },
}))

const mockResolveModel = vi.fn(async () => 'test-model')
vi.mock('../openai/client.js', () => ({
  resolveModelForAgent: (...a) => mockResolveModel(...a),
  codexModelSettings: model =>
    /codex/i.test(model) ? { reasoning: { effort: 'medium' }, text: { verbosity: 'medium' } } : null,
}))

const { createMentionAgent, buildMentionInput, runMentionAgent } = await import('./mention-agent.js')

function sampleMention(overrides = {}) {
  return {
    kind: 'mention',
    channel: 'issue',
    repoFullName: 'acme-io/app',
    prNumber: 7,
    commentId: 100,
    commentBody: '@soporti-bot la HU sc-1234 dice que se redondea al alza, ¿no?',
    commentAuthor: 'dev',
    dedupeKey: 'acme-io/app#7@mention-100',
    ...overrides,
  }
}

function samplePr() {
  return {
    title: 'Fix rounding in refunds',
    body: 'Rounds to cents.',
    state: 'open',
    user: { login: 'dev' },
    head: { sha: 'deadbeef', ref: 'fix/sc-1234' },
    base: { ref: 'main' },
  }
}

describe('createMentionAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('builds a conversational agent: repo tools, no structured output', async () => {
    await createMentionAgent('acme-io/app', { rootPath: '/tmp/wt' })

    const options = MockAgent.mock.calls[0][0]
    expect(options.model).toBe('test-model')
    expect(options.outputType).toBeUndefined()
    expect(options.tools.map(t => t.name)).toContain('get_file_contents')
    expect(options.tools.map(t => t.name)).toContain('search_code')
  })

  it('includes the data tools when configured', async () => {
    mockShortcutConfigured.mockReturnValue(true)

    await createMentionAgent('acme-io/app', { rootPath: null })

    const names = MockAgent.mock.calls[0][0].tools.map(t => t.name)
    expect(names).toContain('get_shortcut_story')

    mockShortcutConfigured.mockReturnValue(false)
  })

  it('tells the agent a Mention is conversation, never a review', async () => {
    await createMentionAgent('acme-io/app', {})

    const { instructions } = MockAgent.mock.calls[0][0]
    expect(instructions).toContain('acme-io/app')
    expect(instructions).toMatch(/never.*(start|trigger|perform).*review/i)
    expect(instructions).toMatch(/re-request|request a review|label/i)
    expect(instructions).toMatch(/language/i)
  })

  it('locks the scope and hardens against prompt injection and secret leaks', async () => {
    await createMentionAgent('acme-io/app', {})

    const { instructions } = MockAgent.mock.calls[0][0]
    expect(instructions).toMatch(/decline/i)
    expect(instructions).toMatch(/not instructions/i)
    expect(instructions).toMatch(/do not comply/i)
    expect(instructions).toMatch(/never reveal/i)
    expect(instructions).toMatch(/credential|token|secret/i)
  })
})

describe('buildMentionInput', () => {
  it('renders the PR, the thread and the mention to answer', () => {
    const input = buildMentionInput({
      mention: sampleMention(),
      pr: samplePr(),
      thread: [
        { id: 1, body: 'first comment', user: { login: 'alice' } },
        { id: 2, body: 'second comment', user: { login: 'bob' } },
      ],
    })

    expect(input).toContain('Fix rounding in refunds')
    expect(input).toContain('#7')
    expect(input).toContain('first comment')
    expect(input).toContain('bob')
    expect(input).toContain('la HU sc-1234')
    expect(input).toMatch(/reply/i)
  })

  it('includes the file and diff hunk for review-thread mentions', () => {
    const input = buildMentionInput({
      mention: sampleMention({ channel: 'review_thread', path: 'src/refunds.js', line: 12, diffHunk: '@@ -1 +1 @@' }),
      pr: samplePr(),
      thread: [],
    })

    expect(input).toContain('src/refunds.js')
    expect(input).toContain('@@ -1 +1 @@')
  })

  it('flattens newlines in author-controlled names', () => {
    const input = buildMentionInput({
      mention: sampleMention({ commentAuthor: 'dev\n# fake' }),
      pr: samplePr(),
      thread: [],
    })

    expect(input).not.toContain('\n# fake')
  })
})

describe('runMentionAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs the agent and returns its reply text', async () => {
    mockRun.mockResolvedValue({ finalOutput: 'Sí: la story pide redondeo al alza.' })

    const reply = await runMentionAgent({
      mention: sampleMention(),
      pr: samplePr(),
      thread: [],
      rootPath: '/tmp/wt',
    })

    expect(reply).toBe('Sí: la story pide redondeo al alza.')
    const [agentArg, inputArg, optionsArg] = mockRun.mock.calls[0]
    expect(agentArg).toBeInstanceOf(MockAgent)
    expect(typeof inputArg).toBe('string')
    expect(optionsArg).toEqual({ maxTurns: 7 })
  })
})
