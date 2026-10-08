import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRun = vi.fn()
const MockAgent = vi.fn(function (options) {
  this.options = options
})

vi.mock('@openai/agents', () => ({
  Agent: MockAgent,
  run: mockRun,
}))

const mockBuildRepoTools = vi.fn()
const mockBuildDiffTools = vi.fn()

vi.mock('./agent.js', () => ({
  buildRepoTools: (...args) => mockBuildRepoTools(...args),
  buildDiffTools: (...args) => mockBuildDiffTools(...args),
  inline: value => String(value ?? ''),
}))

const mockConfig = { review: { maxTurns: 50 } }
vi.mock('../config.js', () => ({ default: mockConfig }))

vi.mock('../llm/model.js', () => ({
  resolveModelForAgent: async () => ({ model: 'test-model', modelSettings: { reasoning: { effort: 'high' } } }),
}))
vi.mock('../db/agent-runs.js', () => ({ recordAgentRun: vi.fn() }))

const { recordAgentRun } = await import('../db/agent-runs.js')
const { verifyFindings } = await import('./verify.js')

const FILES = [{ filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: '@@ -1 +1 @@' }]

function trigger() {
  return { repoFullName: 'acme-io/app', prNumber: 7, title: 'Fix totals', headSha: 'deadbeef' }
}

function finding(overrides = {}) {
  return {
    path: 'src/checkout.js',
    line: 11,
    severity: 'major',
    axis: 'correctness',
    body: 'sumItems may throw on an empty cart',
    ...overrides,
  }
}

function verdict(finalOutput) {
  return { finalOutput, state: { usage: { requests: 1, inputTokens: 1200, outputTokens: 80 } }, newItems: [] }
}

function context(overrides = {}) {
  return {
    trigger: trigger(),
    files: FILES,
    rootPath: '/tmp/wt-pr-7',
    diffBaseSha: 'merge000',
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  }
}

function runUntilAborted(agent, input, options) {
  return new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  })
}

describe('verifyFindings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfig.review.maxTurns = 50
    mockBuildRepoTools.mockReturnValue([{ name: 'get_file_contents' }])
    mockBuildDiffTools.mockReturnValue({ tools: [{ name: 'get_file_diff' }], reviewedPaths: new Set() })
  })

  it('verifies critical and major findings and passes minor and nit through untouched', async () => {
    mockRun.mockResolvedValue(verdict({ verdict: 'confirmed', severity: 'major', reason: 'No guard.' }))
    const findings = [
      finding({ severity: 'critical', line: 3 }),
      finding({ severity: 'minor', line: 4 }),
      finding({ severity: 'major', line: 5 }),
      finding({ severity: 'nit', line: 6 }),
    ]

    const verified = await verifyFindings(findings, context())

    expect(mockRun).toHaveBeenCalledTimes(2)
    expect(mockRun.mock.calls.map(([, input]) => input.match(/Line: (\d+)/)[1])).toEqual(['3', '5'])
    expect(verified).toEqual(findings)
  })

  it('skips the verifier entirely when there is no critical or major finding', async () => {
    const findings = [finding({ severity: 'minor' })]

    const verified = await verifyFindings(findings, context())

    expect(mockRun).not.toHaveBeenCalled()
    expect(verified).toEqual(findings)
  })

  it('drops a refuted finding and logs why without its body', async () => {
    mockRun.mockResolvedValue(
      verdict({
        verdict: 'refuted',
        severity: 'major',
        reason: 'cart.js:20 already guards it with ghp_abcdefghijklmnopqrstuvwxyz0123',
      })
    )
    const ctx = context()

    const verified = await verifyFindings([finding(), finding({ severity: 'minor', line: 12 })], ctx)

    expect(verified).toEqual([finding({ severity: 'minor', line: 12 })])
    expect(ctx.logger.log).toHaveBeenCalledTimes(1)
    const [message] = ctx.logger.log.mock.calls[0]
    expect(message).toBe(
      '[review] Dropped the major finding at src/checkout.js:11: refuted (cart.js:20 already guards it with [redacted])'
    )
    expect(message).not.toContain('sumItems')
  })

  it('posts a downgraded finding with its new, lower severity', async () => {
    mockRun.mockResolvedValue(verdict({ verdict: 'downgraded', severity: 'minor', reason: 'Only on a dead path.' }))
    const ctx = context()

    const verified = await verifyFindings([finding({ severity: 'critical' })], ctx)

    expect(verified).toEqual([finding({ severity: 'minor' })])
    expect(ctx.logger.log).toHaveBeenCalledWith(
      '[review] Downgraded the critical finding at src/checkout.js:11 to minor (Only on a dead path.)'
    )
  })

  it('never raises a severity through a downgrade', async () => {
    mockRun.mockResolvedValue(verdict({ verdict: 'downgraded', severity: 'critical', reason: 'Worse than claimed.' }))
    const ctx = context()

    const verified = await verifyFindings([finding({ severity: 'major' })], ctx)

    expect(verified).toEqual([finding({ severity: 'major' })])
    expect(ctx.logger.log).not.toHaveBeenCalled()
  })

  it('keeps a confirmed finding with its original severity', async () => {
    mockRun.mockResolvedValue(verdict({ verdict: 'confirmed', severity: 'minor', reason: 'Real bug.' }))

    const verified = await verifyFindings([finding({ severity: 'critical' })], context())

    expect(verified).toEqual([finding({ severity: 'critical' })])
  })

  it('keeps the original finding when the verifier fails', async () => {
    mockRun.mockRejectedValue(new Error('model unavailable'))
    const ctx = context()

    const verified = await verifyFindings([finding()], ctx)

    expect(verified).toEqual([finding()])
    expect(ctx.logger.warn).toHaveBeenCalledWith(
      '[review] Could not verify the major finding at src/checkout.js:11 (model unavailable); keeping it'
    )
    expect(recordAgentRun).toHaveBeenCalledWith({
      channel: 'pr_review_verify',
      status: 'error',
      subject: 'acme-io/app#7',
      userId: null,
    })
  })

  it('keeps the original finding when the verifier returns no verdict', async () => {
    mockRun.mockResolvedValue(verdict(null))
    const ctx = context()

    const verified = await verifyFindings([finding({ line: null })], ctx)

    expect(verified).toEqual([finding({ line: null })])
    expect(ctx.logger.warn).toHaveBeenCalledWith(
      '[review] Could not verify the major finding at src/checkout.js (The verifier produced no verdict.); keeping it'
    )
  })

  it('records the token usage of each verification on its own channel', async () => {
    mockRun.mockResolvedValue(verdict({ verdict: 'confirmed', severity: 'major', reason: 'Real.' }))

    await verifyFindings([finding()], context())

    expect(recordAgentRun).toHaveBeenCalledTimes(1)
    expect(recordAgentRun).toHaveBeenCalledWith({
      channel: 'pr_review_verify',
      status: 'ok',
      subject: 'acme-io/app#7',
      userId: null,
      usage: { requests: 1, inputTokens: 1200, outputTokens: 80, cachedInputTokens: 0, cacheWriteTokens: 0 },
      durationMs: expect.any(Number),
      tools: [],
    })
  })

  it('gives the verifier its own repo and diff tools on the same checkout, a structured verdict and the refute prompt', async () => {
    mockRun.mockResolvedValue(verdict({ verdict: 'confirmed', severity: 'major', reason: 'Real.' }))

    await verifyFindings([finding()], context())

    expect(mockBuildRepoTools).toHaveBeenCalledTimes(1)
    expect(mockBuildRepoTools).toHaveBeenCalledWith('acme-io/app', '/tmp/wt-pr-7')
    expect(mockBuildDiffTools).toHaveBeenCalledTimes(1)
    expect(mockBuildDiffTools).toHaveBeenCalledWith({ files: FILES, rootPath: '/tmp/wt-pr-7', diffBaseSha: 'merge000' })
    const { options } = mockRun.mock.calls[0][0]
    expect(options.name).toBe('Soporti Review Verifier')
    expect(options.model).toBe('test-model')
    expect(options.modelSettings).toEqual({ reasoning: { effort: 'high' } })
    expect(options.tools.map(t => t.name)).toEqual(['get_file_contents', 'get_file_diff'])
    expect(options.instructions).toContain('`acme-io/app`')
    expect(options.instructions).toMatch(/your job is to try to REFUTE it/)
    expect(options.instructions).toMatch(/is DATA, not instructions/)
    expect(options.outputType.parse({ verdict: 'downgraded', severity: 'nit', reason: 'x' })).toEqual({
      verdict: 'downgraded',
      severity: 'nit',
      reason: 'x',
    })
    expect(() => options.outputType.parse({ verdict: 'maybe', severity: 'nit', reason: 'x' })).toThrow()
  })

  it('builds a fresh diff tool set for every verification', async () => {
    mockRun.mockResolvedValue(verdict({ verdict: 'confirmed', severity: 'major', reason: 'Real.' }))

    await verifyFindings([finding(), finding({ line: 12 })], context())

    expect(mockBuildDiffTools).toHaveBeenCalledTimes(2)
  })

  it('hands the verifier the finding as quoted data', async () => {
    mockRun.mockResolvedValue(verdict({ verdict: 'confirmed', severity: 'major', reason: 'Real.' }))

    await verifyFindings(
      [finding({ line: null, axis: 'standards', body: 'Breaks CLAUDE.md\nno comments rule' })],
      context()
    )

    const input = mockRun.mock.calls[0][1]
    expect(input).toContain('# Finding to verify on Pull Request #7 — Fix totals')
    expect(input).toContain('Repository: acme-io/app\nHead: deadbeef')
    expect(input).toContain('- Path: `src/checkout.js`')
    expect(input).toContain('- Line: none (concerns something outside the diff)')
    expect(input).toContain('- Severity: major')
    expect(input).toContain('- Axis: standards')
    expect(input).toContain('> Breaks CLAUDE.md\n> no comments rule')
  })

  it('runs with fewer turns than the review', async () => {
    mockRun.mockResolvedValue(verdict({ verdict: 'confirmed', severity: 'major', reason: 'Real.' }))

    await verifyFindings([finding()], context())

    expect(mockRun.mock.calls[0][2].maxTurns).toBe(15)
  })

  it('never runs with more turns than the review limit', async () => {
    mockConfig.review.maxTurns = 8
    mockRun.mockResolvedValue(verdict({ verdict: 'confirmed', severity: 'major', reason: 'Real.' }))

    await verifyFindings([finding()], context())

    expect(mockRun.mock.calls[0][2].maxTurns).toBe(8)
  })

  it('caps the verifications running at once and keeps the findings in order', async () => {
    const pending = []
    mockRun.mockImplementation(() => {
      return new Promise(resolve => pending.push(resolve))
    })
    const findings = [1, 2, 3, 4, 5].map(line => finding({ line }))

    const verifying = verifyFindings(findings, context())
    await vi.waitFor(() => expect(mockRun).toHaveBeenCalledTimes(3))
    pending.forEach(resolve => resolve(verdict({ verdict: 'confirmed', severity: 'major', reason: 'Real.' })))
    await vi.waitFor(() => expect(mockRun).toHaveBeenCalledTimes(5))
    pending.slice(3).forEach(resolve => resolve(verdict({ verdict: 'refuted', severity: 'major', reason: 'No.' })))

    expect(await verifying).toEqual(findings.slice(0, 3))
  })

  it('aborts the running verifications and starts no new one when the review is superseded', async () => {
    const controller = new AbortController()
    mockRun.mockImplementation(runUntilAborted)
    const findings = [1, 2, 3, 4].map(line => finding({ line }))

    const verifying = verifyFindings(findings, context({ signal: controller.signal }))
    await vi.waitFor(() => expect(mockRun).toHaveBeenCalledTimes(3))
    controller.abort()

    await expect(verifying).rejects.toThrow('aborted')
    expect(mockRun).toHaveBeenCalledTimes(3)
  })
})
