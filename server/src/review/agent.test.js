import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRun = vi.fn()
class MockMaxTurnsExceededError extends Error {}
const MockAgent = vi.fn(function (options) {
  this.options = options
})

vi.mock('@openai/agents', () => ({
  Agent: MockAgent,
  MaxTurnsExceededError: MockMaxTurnsExceededError,
  run: mockRun,
  tool: def => def,
}))

const mockGetDirectoryContents = vi.fn()
const mockGetFileContents = vi.fn()
const mockSearchCode = vi.fn()
const mockFindFiles = vi.fn()
const mockGitLogFile = vi.fn()
const mockGitBlame = vi.fn()
const mockGetDirectoryContentsAt = vi.fn()
const mockGetFileContentsAt = vi.fn()
const mockSearchCodeAt = vi.fn()
const mockFindFilesAt = vi.fn()
const mockGitLogFileAt = vi.fn()
const mockGitBlameAt = vi.fn()
const mockGitDiffAt = vi.fn()

vi.mock('../repo-pool/index.js', async () => ({
  pageLines: (await vi.importActual('../repo-pool/operations.js')).pageLines,
  gitDiffAt: (...a) => mockGitDiffAt(...a),
  getDirectoryContents: (...a) => mockGetDirectoryContents(...a),
  getFileContents: (...a) => mockGetFileContents(...a),
  searchCode: (...a) => mockSearchCode(...a),
  findFiles: (...a) => mockFindFiles(...a),
  gitLogFile: (...a) => mockGitLogFile(...a),
  gitBlame: (...a) => mockGitBlame(...a),
  getDirectoryContentsAt: (...a) => mockGetDirectoryContentsAt(...a),
  getFileContentsAt: (...a) => mockGetFileContentsAt(...a),
  searchCodeAt: (...a) => mockSearchCodeAt(...a),
  findFilesAt: (...a) => mockFindFilesAt(...a),
  gitLogFileAt: (...a) => mockGitLogFileAt(...a),
  gitBlameAt: (...a) => mockGitBlameAt(...a),
}))

const mockShortcutConfigured = vi.fn()
const mockSentryConfigured = vi.fn()
const mockPostgresConfigured = vi.fn()
const mockBetterstackConfigured = vi.fn()

vi.mock('../shortcut/client.js', () => ({
  isConfigured: () => mockShortcutConfigured(),
  getStory: vi.fn(),
  searchStories: vi.fn(),
}))
vi.mock('../sentry/client.js', () => ({
  isConfigured: () => mockSentryConfigured(),
  getIssue: vi.fn(),
  searchIssues: vi.fn(),
}))
vi.mock('../postgres/client.js', () => ({
  isConfigured: () => mockPostgresConfigured(),
  listSchemas: vi.fn(),
  listTables: vi.fn(),
  describeTable: vi.fn(),
  runQuery: vi.fn(),
}))
vi.mock('../betterstack/client.js', () => ({
  isConfigured: () => mockBetterstackConfigured(),
  listSources: vi.fn(),
  describeSource: vi.fn(),
  searchLogs: vi.fn(),
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
    review: { reasoningEffort: 'high', maxTurns: 42 },
    repoPool: {},
  },
}))

const mockResolveModel = vi.fn(async () => ({
  provider: 'openai',
  modelId: 'test-model',
  model: 'test-model',
  modelSettings: {},
}))
vi.mock('../llm/model.js', () => ({ resolveModelForAgent: (...a) => mockResolveModel(...a) }))
vi.mock('../db/agent-runs.js', () => ({ recordAgentRun: vi.fn() }))

function resolvedModel(modelSettings) {
  return { provider: 'openai', modelId: 'test-model', model: 'test-model', modelSettings }
}

const { recordAgentRun } = await import('../db/agent-runs.js')
const { overviewOutputSchema, finderOutputSchema, buildRepoTools, buildDataTools, buildDiffTools, runReviewAgent } =
  await import('./agent.js')

function overview(overrides = {}) {
  return {
    walkthrough: 'Rounds refunds to cents before persisting them.',
    changes: [{ label: 'Refund rounding', files: ['src/refunds.js'], summary: 'Rounds before saving.' }],
    effort: 2,
    reviewMinutes: 10,
    diagram: null,
    previousFindings: null,
    fixedThreads: [],
    verdict: 'comment',
    ...overrides,
  }
}

function finding(overrides = {}) {
  return {
    path: 'src/refunds.js',
    startLine: null,
    line: 12,
    severity: 'minor',
    category: 'bug',
    title: 'Rounding drops the last cent.',
    body: 'Math.floor truncates negative amounts.',
    suggestion: null,
    fixPrompt: 'Use Math.round in roundToCents and add a test for -0.005.',
    ...overrides,
  }
}

function toolNames(tools) {
  return tools.map(t => t.name)
}

function agentRun(overrides = {}) {
  return {
    name: 'Soporti Review Finder (security)',
    instructions: 'Find vulnerabilities.',
    tools: [{ name: 'get_file_diff' }],
    outputType: finderOutputSchema,
    sharedContext: { text: '# Pull Request #7 — Fix rounding', inlinedPaths: [] },
    task: '## Your task: the security pass',
    channel: 'pr_review',
    subject: 'acme-io/app#7',
    maxTurns: 42,
    ...overrides,
  }
}

describe('overviewOutputSchema', () => {
  it('accepts the overview fields and the verdict, with no findings', () => {
    const output = overview({
      verdict: 'approve',
      diagram: 'sequenceDiagram\n  A->>B: refund',
      previousFindings: '- Fixed',
      fixedThreads: ['T1', 'T3'],
    })

    expect(overviewOutputSchema.parse(output)).toEqual(output)
    expect(overviewOutputSchema.parse({ ...output, findings: [finding()] })).not.toHaveProperty('findings')
  })

  it('leaves the effort unbounded so the server can clamp it', () => {
    expect(overviewOutputSchema.parse(overview({ effort: 9 })).effort).toBe(9)
  })

  it('rejects an unknown verdict', () => {
    expect(() => overviewOutputSchema.parse(overview({ verdict: 'request_changes' }))).toThrow()
  })

  it('requires the list of fixed threads', () => {
    expect(() => overviewOutputSchema.parse(overview({ fixedThreads: undefined }))).toThrow()
  })
})

describe('finderOutputSchema', () => {
  it('accepts the findings of a pass and its note', () => {
    const output = {
      findings: [finding({ startLine: 10, suggestion: 'const cents = Math.round(amount * 100)' })],
      note: 'Follows CLAUDE.md.',
    }

    expect(finderOutputSchema.parse(output)).toEqual(output)
  })

  it('accepts a finding outside the diff, with no line and no suggestion', () => {
    const parsed = finderOutputSchema.parse({ findings: [finding({ line: null, severity: 'major' })], note: '' })

    expect(parsed.findings[0].line).toBeNull()
    expect(parsed.findings[0].suggestion).toBeNull()
  })

  it('tags every finding with one of the review categories', () => {
    for (const category of ['bug', 'security', 'performance', 'maintainability', 'tests', 'standards', 'spec']) {
      const parsed = finderOutputSchema.parse({ findings: [finding({ category })], note: '' })
      expect(parsed.findings[0].category).toBe(category)
    }
  })

  it('rejects unknown severities and categories, a finding without a title or fix prompt and a missing note', () => {
    expect(() => finderOutputSchema.parse({ findings: [finding({ severity: 'blocker' })], note: '' })).toThrow()
    expect(() => finderOutputSchema.parse({ findings: [finding({ category: 'vibes' })], note: '' })).toThrow()
    expect(() => finderOutputSchema.parse({ findings: [finding({ title: undefined })], note: '' })).toThrow()
    expect(() => finderOutputSchema.parse({ findings: [finding({ fixPrompt: undefined })], note: '' })).toThrow()
    expect(() => finderOutputSchema.parse({ findings: [] })).toThrow()
  })
})

describe('buildRepoTools', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exposes the repository tools, pinned to the triggered repository with no repo parameter', async () => {
    const tools = buildRepoTools('acme-io/app')

    expect(toolNames(tools)).toEqual([
      'get_directory_contents',
      'get_file_contents',
      'search_code',
      'find_files',
      'git_log_file',
      'git_blame',
    ])
    for (const t of tools) expect(Object.keys(t.parameters.shape)).not.toContain('repo')

    mockGetFileContents.mockResolvedValue({ lines: [] })
    const getFile = tools.find(t => t.name === 'get_file_contents')
    await getFile.execute({ path: 'src/a.js', offset: 0, limit: 100, centerLine: null, contextLines: 100 })
    expect(mockGetFileContents).toHaveBeenCalledWith('acme-io/app', 'src/a.js', {
      offset: 0,
      limit: 100,
      centerLine: null,
      contextLines: 100,
    })

    mockSearchCode.mockResolvedValue([])
    const search = tools.find(t => t.name === 'search_code')
    await search.execute({ query: 'foo', pathGlob: '', caseInsensitive: false, regex: false, maxResults: 10 })
    expect(mockSearchCode).toHaveBeenCalledWith('acme-io/app', 'foo', {
      pathGlob: '',
      caseInsensitive: false,
      regex: false,
      maxResults: 10,
    })

    mockGitBlame.mockResolvedValue({})
    const blame = tools.find(t => t.name === 'git_blame')
    await blame.execute({ path: 'src/a.js', startLine: 1, endLine: null })
    expect(mockGitBlame).toHaveBeenCalledWith('acme-io/app', 'src/a.js', { startLine: 1, endLine: null })
  })

  it('defaults its file reads to a narrow window and bounds its search results', () => {
    const tools = buildRepoTools('acme-io/app')

    const read = tools.find(t => t.name === 'get_file_contents').parameters.parse({ path: 'src/a.js' })
    expect(read.limit).toBe(300)
    expect(read.contextLines).toBe(100)
    expect(read.centerLine).toBeNull()
    expect(tools.find(t => t.name === 'search_code').parameters.parse({ query: 'foo' }).maxResults).toBe(100)
    expect(tools.find(t => t.name === 'find_files').parameters.parse({ pattern: '*.js' }).maxResults).toBe(50)
  })

  it('reads through the PR-head checkout when given one', async () => {
    const tools = buildRepoTools('acme-io/app', '/tmp/wt-pr-7')

    mockGetFileContentsAt.mockResolvedValue({ lines: [] })
    await tools
      .find(t => t.name === 'get_file_contents')
      .execute({ path: 'src/a.js', offset: 0, limit: 100, centerLine: 412, contextLines: 40 })
    expect(mockGetFileContentsAt).toHaveBeenCalledWith('/tmp/wt-pr-7', 'src/a.js', {
      offset: 0,
      limit: 100,
      centerLine: 412,
      contextLines: 40,
    })
    expect(mockGetFileContents).not.toHaveBeenCalled()

    mockFindFilesAt.mockResolvedValue({ items: [] })
    await tools.find(t => t.name === 'find_files').execute({ pattern: '*.js', maxResults: 10 })
    expect(mockFindFilesAt).toHaveBeenCalledWith('/tmp/wt-pr-7', '*.js', { maxResults: 10 })
  })
})

describe('buildDataTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const configured of [
      mockShortcutConfigured,
      mockSentryConfigured,
      mockPostgresConfigured,
      mockBetterstackConfigured,
    ]) {
      configured.mockReturnValue(false)
    }
  })

  it('returns no tool when no data integration is configured', async () => {
    expect(await buildDataTools()).toEqual([])
  })

  it('adds the Shortcut, Sentry and Postgres tools when those integrations are configured', async () => {
    mockShortcutConfigured.mockReturnValue(true)
    mockSentryConfigured.mockReturnValue(true)
    mockPostgresConfigured.mockReturnValue(true)

    expect(toolNames(await buildDataTools())).toEqual([
      'get_shortcut_story',
      'search_shortcut_stories',
      'get_sentry_issue',
      'search_sentry_issues',
      'list_database_schemas',
      'list_database_tables',
      'describe_database_table',
      'query_database',
    ])
  })

  it('adds only the tools of the configured integrations', async () => {
    mockSentryConfigured.mockReturnValue(true)

    expect(toolNames(await buildDataTools())).toEqual(['get_sentry_issue', 'search_sentry_issues'])
  })

  it('adds the Better Stack log tools only when the integration is configured', async () => {
    mockBetterstackConfigured.mockReturnValue(true)

    const names = toolNames(await buildDataTools())
    expect(names).toContain('list_log_sources')
    expect(names).toContain('search_logs')
    expect(names).toContain('query_logs')
  })
})

describe('runReviewAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs an agent with the resolved model on the shared context followed by its own task', async () => {
    mockResolveModel.mockResolvedValueOnce(resolvedModel({ reasoning: { effort: 'high' } }))
    mockRun.mockResolvedValue({ finalOutput: { findings: [], note: 'ok' } })
    const controller = new AbortController()

    const output = await runReviewAgent(agentRun({ signal: controller.signal }))

    expect(output).toEqual({ findings: [], note: 'ok' })
    expect(MockAgent).toHaveBeenCalledTimes(1)
    expect(MockAgent.mock.calls[0][0]).toEqual({
      name: 'Soporti Review Finder (security)',
      model: 'test-model',
      instructions: 'Find vulnerabilities.',
      tools: [{ name: 'get_file_diff' }],
      outputType: finderOutputSchema,
      modelSettings: { reasoning: { effort: 'high' } },
    })
    expect(mockRun).toHaveBeenCalledTimes(1)
    const [agentArg, inputArg, optionsArg] = mockRun.mock.calls[0]
    expect(agentArg).toBeInstanceOf(MockAgent)
    expect(inputArg).toBe('# Pull Request #7 — Fix rounding\n\n## Your task: the security pass')
    expect(optionsArg).toEqual({ maxTurns: 42, signal: controller.signal })
  })

  it('records the run on its channel against the PR it reviewed', async () => {
    mockRun.mockResolvedValue({
      finalOutput: { findings: [], note: 'ok' },
      state: { usage: { requests: 4, inputTokens: 40_000, outputTokens: 1500 } },
      newItems: [{ type: 'tool_call_item', rawItem: { name: 'get_file_contents' } }],
    })

    await runReviewAgent(agentRun({ channel: 'pr_review_verify' }))

    expect(recordAgentRun).toHaveBeenCalledTimes(1)
    expect(recordAgentRun).toHaveBeenCalledWith({
      channel: 'pr_review_verify',
      status: 'ok',
      subject: 'acme-io/app#7',
      userId: null,
      usage: { requests: 4, inputTokens: 40_000, outputTokens: 1500, cachedInputTokens: 0, cacheWriteTokens: 0 },
      durationMs: expect.any(Number),
      tools: ['get_file_contents'],
    })
  })

  it('throws and records the tokens it burnt when the run produces no final output', async () => {
    mockRun.mockResolvedValueOnce({
      finalOutput: undefined,
      state: { usage: { requests: 20, inputTokens: 400_000, outputTokens: 8000 } },
      newItems: [{ type: 'tool_call_item', rawItem: { name: 'search_code' } }],
    })

    await expect(runReviewAgent(agentRun())).rejects.toThrow(/no output.*turn limit/i)

    expect(recordAgentRun).toHaveBeenCalledTimes(1)
    expect(recordAgentRun).toHaveBeenCalledWith({
      channel: 'pr_review',
      status: 'error',
      subject: 'acme-io/app#7',
      userId: null,
      usage: { requests: 20, inputTokens: 400_000, outputTokens: 8000, cachedInputTokens: 0, cacheWriteTokens: 0 },
      durationMs: expect.any(Number),
      tools: ['search_code'],
    })
  })

  it('reports the turn limit when the run exceeds it', async () => {
    const cause = new MockMaxTurnsExceededError('Max turns (42) exceeded')
    mockRun.mockRejectedValue(cause)

    const err = await runReviewAgent(agentRun()).catch(e => e)

    expect(err.message).toBe('The run hit the turn limit of 42 turns.')
    expect(err.code).toBe('REVIEW_TURN_LIMIT')
    expect(err.maxTurns).toBe(42)
    expect(err.cause).toBe(cause)
    expect(recordAgentRun).toHaveBeenCalledTimes(1)
    expect(recordAgentRun).toHaveBeenCalledWith({
      channel: 'pr_review',
      status: 'error',
      subject: 'acme-io/app#7',
      userId: null,
    })
  })

  it('rethrows any other run failure unchanged and records it', async () => {
    const failure = new Error('model unavailable')
    mockRun.mockRejectedValue(failure)

    await expect(runReviewAgent(agentRun())).rejects.toBe(failure)

    expect(recordAgentRun).toHaveBeenCalledTimes(1)
    expect(recordAgentRun).toHaveBeenCalledWith({
      channel: 'pr_review',
      status: 'error',
      subject: 'acme-io/app#7',
      userId: null,
    })
  })
})

describe('buildDiffTools', () => {
  beforeEach(() => vi.clearAllMocks())

  const PATCH = '@@ -1,2 +1,3 @@\n line one\n-old two\n+new two\n+three'

  function findTool(diffTools, name) {
    return diffTools.tools.find(t => t.name === name)
  }

  async function readDiff(diffTools, input) {
    const getFileDiff = findTool(diffTools, 'get_file_diff')
    return JSON.parse(await getFileDiff.execute(getFileDiff.parameters.parse(input)))
  }

  it('returns the GitHub patch of a changed file and counts the file as reviewed', async () => {
    const diffTools = buildDiffTools({ files: [{ filename: 'src/a.js', patch: PATCH }] })

    const result = await readDiff(diffTools, { path: 'src/a.js' })

    expect(result).toEqual({
      path: 'src/a.js',
      content: '@@ -1,2 +1,3 @@\n1  line one\n  -old two\n2 +new two\n3 +three',
      offset: 0,
      lineCount: 5,
      totalLines: 5,
      truncated: false,
    })
    expect(diffTools.reviewedPaths).toEqual(new Set(['src/a.js']))
    expect(mockGitDiffAt).not.toHaveBeenCalled()
  })

  it('counts the files whose diff was inlined as reviewed from the start', () => {
    const diffTools = buildDiffTools({
      files: [
        { filename: 'src/a.js', patch: PATCH },
        { filename: 'src/b.js', patch: PATCH },
      ],
      inlinedPaths: ['src/a.js'],
    })

    expect(diffTools.reviewedPaths).toEqual(new Set(['src/a.js']))
  })

  it('pages a long diff and counts the file as reviewed only once every page was read', async () => {
    const longPatch = ['@@ -1,0 +1,2500 @@', ...Array.from({ length: 2499 }, (_, i) => `+line ${i}`)].join('\n')
    const diffTools = buildDiffTools({ files: [{ filename: 'src/big.js', patch: longPatch }] })

    const first = await readDiff(diffTools, { path: 'src/big.js' })

    expect(first.lineCount).toBe(1000)
    expect(first.totalLines).toBe(2500)
    expect(first.truncated).toBe(true)
    expect(first.nextOffset).toBe(1000)
    expect(first.hint).toMatch(/Diff has 2500 lines/)
    expect(diffTools.reviewedPaths.size).toBe(0)

    await readDiff(diffTools, { path: 'src/big.js', offset: 2000 })
    expect(diffTools.reviewedPaths.size).toBe(0)

    const middle = await readDiff(diffTools, { path: 'src/big.js', offset: first.nextOffset })
    expect(middle.content.split('\n')[0]).toBe('1000 +line 999')
    expect(diffTools.reviewedPaths).toEqual(new Set(['src/big.js']))
  })

  it('bounds the page size to the file read limit', () => {
    const getFileDiff = findTool(buildDiffTools({ files: [] }), 'get_file_diff')

    expect(getFileDiff.parameters.parse({ path: 'a.js' })).toEqual({ path: 'a.js', offset: 0, limit: 1000 })
    expect(() => getFileDiff.parameters.parse({ path: 'a.js', limit: 5001 })).toThrow()
  })

  it('rejects paths that are not part of the PR without reading anything', async () => {
    const diffTools = buildDiffTools({
      files: [{ filename: 'src/a.js', patch: PATCH }],
      rootPath: '/tmp/wt-pr-7',
      diffBaseSha: 'base1234',
    })

    const result = await readDiff(diffTools, { path: '.env' })

    expect(result.error).toMatch(/not one of the files changed by this PR/)
    expect(mockGitDiffAt).not.toHaveBeenCalled()
    expect(diffTools.reviewedPaths.size).toBe(0)
  })

  it('falls back to a git diff in the PR-head checkout when GitHub returned no patch, running it once', async () => {
    const localDiff = 'diff --git a/package-lock.json b/package-lock.json\n@@ -1 +1 @@\n-"a"\n+"b"'
    mockGitDiffAt.mockResolvedValue(localDiff)
    const diffTools = buildDiffTools({
      files: [{ filename: 'package-lock.json', additions: 6000, deletions: 5000 }],
      rootPath: '/tmp/wt-pr-7',
      diffBaseSha: 'base1234',
    })

    const first = await readDiff(diffTools, { path: 'package-lock.json', limit: 2 })
    const second = await readDiff(diffTools, { path: 'package-lock.json', offset: 2 })

    expect(first.content).toBe('  diff --git a/package-lock.json b/package-lock.json\n@@ -1 +1 @@')
    expect(second.content).toBe('  -"a"\n1 +"b"')
    expect(mockGitDiffAt).toHaveBeenCalledTimes(1)
    expect(mockGitDiffAt).toHaveBeenCalledWith('/tmp/wt-pr-7', 'package-lock.json', { baseSha: 'base1234' })
    expect(diffTools.reviewedPaths).toEqual(new Set(['package-lock.json']))
  })

  it('cannot read a patch-less file without a PR-head checkout, which leaves it not reviewed', async () => {
    const files = [{ filename: 'db/seed.sql', additions: 9000, deletions: 0 }]

    for (const options of [{}, { rootPath: '/tmp/wt-pr-7' }, { diffBaseSha: 'base1234' }]) {
      const diffTools = buildDiffTools({ files, ...options })

      const result = await readDiff(diffTools, { path: 'db/seed.sql' })

      expect(result.error).toMatch(/no patch for this file/)
      expect(diffTools.reviewedPaths.size).toBe(0)
    }
    expect(mockGitDiffAt).not.toHaveBeenCalled()
  })

  it('surfaces a failing git diff to the agent without counting the file as reviewed', async () => {
    mockGitDiffAt.mockRejectedValue(new Error('git diff failed: bad object'))
    const diffTools = buildDiffTools({
      files: [{ filename: 'yarn.lock', additions: 10, deletions: 0 }],
      rootPath: '/tmp/wt-pr-7',
      diffBaseSha: 'base1234',
    })

    await expect(readDiff(diffTools, { path: 'yarn.lock' })).rejects.toThrow('git diff failed: bad object')
    expect(diffTools.reviewedPaths.size).toBe(0)
  })

  it('registers get_diff_since_last_review only on an incremental re-review', () => {
    const names = changes => buildDiffTools({ files: [], changes }).tools.map(t => t.name)

    expect(names(null)).toEqual(['get_file_diff'])
    expect(names({ status: 'diverged' })).toEqual(['get_file_diff'])
    expect(names({ status: 'unavailable' })).toEqual(['get_file_diff'])
    expect(names({ status: 'incremental', files: [] })).toEqual(['get_file_diff', 'get_diff_since_last_review'])
  })

  it('returns the patch pushed since the last review without counting the file as reviewed', async () => {
    const diffTools = buildDiffTools({
      files: [{ filename: 'src/a.js', patch: PATCH }],
      changes: {
        status: 'incremental',
        files: [
          { filename: 'src/a.js', patch: '@@ -3 +3 @@\n-three\n+3' },
          { filename: 'src/huge.js', additions: 7000 },
        ],
      },
    })
    const since = findTool(diffTools, 'get_diff_since_last_review')

    const changed = JSON.parse(await since.execute(since.parameters.parse({ path: 'src/a.js' })))
    const noPatch = JSON.parse(await since.execute(since.parameters.parse({ path: 'src/huge.js' })))
    const unchanged = JSON.parse(await since.execute(since.parameters.parse({ path: 'src/b.js' })))

    expect(changed).toEqual({
      path: 'src/a.js',
      content: '@@ -3 +3 @@\n  -three\n3 +3',
      offset: 0,
      lineCount: 3,
      totalLines: 3,
      truncated: false,
    })
    expect(noPatch.error).toMatch(/no patch.*get_file_diff/)
    expect(unchanged.error).toMatch(/did not change since your last review/)
    expect(diffTools.reviewedPaths.size).toBe(0)
  })
})
