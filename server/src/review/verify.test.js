import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRunReviewAgent = vi.fn()
const mockBuildRepoTools = vi.fn()
const mockBuildDiffTools = vi.fn()

vi.mock('./agent.js', () => ({
  buildRepoTools: (...args) => mockBuildRepoTools(...args),
  buildDiffTools: (...args) => mockBuildDiffTools(...args),
  runReviewAgent: (...args) => mockRunReviewAgent(...args),
}))

const mockConfig = { review: { maxTurns: 50 } }
vi.mock('../config.js', () => ({ default: mockConfig }))

const { verifyFindings } = await import('./verify.js')

const FILES = [{ filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: '@@ -1 +1 @@' }]
const SHARED_CONTEXT = { text: '# Pull Request #7 — Fix totals', inlinedPaths: ['src/checkout.js'] }

function trigger() {
  return { repoFullName: 'acme-io/app', prNumber: 7, title: 'Fix totals', headSha: 'deadbeef' }
}

function finding(overrides = {}) {
  return {
    path: 'src/checkout.js',
    startLine: null,
    line: 11,
    severity: 'major',
    category: 'bug',
    title: 'sumItems throws on an empty cart.',
    body: 'sumItems may throw on an empty cart',
    suggestion: null,
    fixPrompt: 'Return 0 from sumItems for an empty cart.',
    lens: 'correctness',
    ...overrides,
  }
}

function verdict(id, overrides = {}) {
  return {
    id,
    verdict: 'confirmed',
    severity: 'major',
    duplicateOf: null,
    suggestionValid: true,
    evidence: `${id} is real: src/checkout.js:11 has no guard.`,
    ...overrides,
  }
}

function scope(overrides = {}) {
  return {
    trigger: trigger(),
    files: FILES,
    sharedContext: SHARED_CONTEXT,
    changes: null,
    rootPath: '/tmp/wt-pr-7',
    diffBaseSha: 'merge000',
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  }
}

function idsOf(task) {
  return [...task.matchAll(/^### (F\d+) — /gm)].map(match => match[1])
}

function clustersVerified() {
  return mockRunReviewAgent.mock.calls.map(([options]) => idsOf(options.task))
}

function confirmEverything() {
  mockRunReviewAgent.mockImplementation(async ({ task }) => ({
    output: { verdicts: idsOf(task).map(id => verdict(id)) },
    wrappedUp: false,
  }))
}

function respondWith(verdicts) {
  mockRunReviewAgent.mockImplementation(async ({ task }) => ({
    output: { verdicts: idsOf(task).flatMap(id => verdicts[id] ?? []) },
    wrappedUp: false,
  }))
}

function runUntilAborted({ signal }) {
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  })
}

describe('verifyFindings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfig.review.maxTurns = 50
    mockBuildRepoTools.mockReturnValue([{ name: 'get_file_contents' }])
    mockBuildDiffTools.mockReturnValue({ tools: [{ name: 'get_file_diff' }], reviewedPaths: new Set() })
    confirmEverything()
  })

  it('verifies every critical, major and minor finding and passes the nits through unverified', async () => {
    const nit = finding({ severity: 'nit', line: 40 })
    const candidates = [finding({ severity: 'critical', line: 3 }), finding({ severity: 'minor', line: 20 }), nit]

    const { findings, stats } = await verifyFindings(candidates, scope())

    expect(clustersVerified()).toEqual([['F1'], ['F2']])
    expect(findings).toEqual([
      { ...candidates[0], evidence: 'F1 is real: src/checkout.js:11 has no guard.' },
      { ...candidates[1], evidence: 'F2 is real: src/checkout.js:11 has no guard.' },
      nit,
    ])
    expect(stats).toEqual({ proposed: 2, confirmed: 2, downgraded: 0, dropped: 0, unverified: 0, skipped: 0 })
  })

  it('skips the verifier when every finding is a nit', async () => {
    const { findings, stats } = await verifyFindings([finding({ severity: 'nit' })], scope())

    expect(mockRunReviewAgent).not.toHaveBeenCalled()
    expect(findings).toEqual([finding({ severity: 'nit' })])
    expect(stats).toEqual({ proposed: 0, confirmed: 0, downgraded: 0, dropped: 0, unverified: 0, skipped: 0 })
  })

  it('clusters the findings of one file whose lines are within 3 of each other, transitively', async () => {
    await verifyFindings(
      [
        finding({ line: 16, severity: 'minor' }),
        finding({ line: 10 }),
        finding({ path: 'src/cart.js', line: 11 }),
        finding({ line: 30 }),
        finding({ line: 13 }),
      ],
      scope()
    )

    expect(clustersVerified()).toEqual([['F2', 'F5', 'F1'], ['F4'], ['F3']])
  })

  it('clusters a multi-line finding by its whole range', async () => {
    await verifyFindings([finding({ startLine: 5, line: 20 }), finding({ line: 23 }), finding({ line: 27 })], scope())

    expect(clustersVerified()).toEqual([['F1', 'F2'], ['F3']])
  })

  it('groups the findings outside the diff of one file in a cluster of their own', async () => {
    await verifyFindings(
      [finding({ line: null }), finding({ line: 11 }), finding({ line: null }), finding({ path: 'b.js', line: null })],
      scope()
    )

    expect(clustersVerified()).toEqual([['F1', 'F3'], ['F2'], ['F4']])
  })

  it('drops refuted and pre-existing findings and logs why without their body', async () => {
    respondWith({
      F1: verdict('F1', {
        verdict: 'refuted',
        evidence: 'cart.js:20 guards it with ghp_abcdefghijklmnopqrstuvwxyz0123',
      }),
      F2: verdict('F2', { verdict: 'pre_existing', evidence: 'Unchanged since 2023.' }),
      F3: verdict('F3'),
    })
    const options = scope()

    const { findings, stats } = await verifyFindings(
      [finding(), finding({ line: 40, severity: 'minor' }), finding({ path: 'src/cart.js' })],
      options
    )

    expect(findings).toEqual([
      { ...finding({ path: 'src/cart.js' }), evidence: 'F3 is real: src/checkout.js:11 has no guard.' },
    ])
    expect(stats).toEqual({ proposed: 3, confirmed: 1, downgraded: 0, dropped: 2, unverified: 0, skipped: 0 })
    expect(options.logger.log.mock.calls.map(([message]) => message)).toEqual([
      '[review] Dropped the major finding at src/checkout.js:11: refuted (cart.js:20 guards it with [redacted])',
      '[review] Dropped the minor finding at src/checkout.js:40: pre_existing (Unchanged since 2023.)',
    ])
    expect(options.logger.log.mock.calls.flat().join('\n')).not.toContain('sumItems')
  })

  it('posts a downgraded finding with its lower severity and never raises one', async () => {
    respondWith({
      F1: verdict('F1', { verdict: 'downgraded', severity: 'minor', evidence: 'Only on a dead path.' }),
      F2: verdict('F2', { verdict: 'downgraded', severity: 'critical' }),
      F3: verdict('F3', { severity: 'critical' }),
    })
    const options = scope()

    const { findings, stats } = await verifyFindings(
      [finding({ severity: 'critical' }), finding({ line: 40 }), finding({ line: 80, severity: 'minor' })],
      options
    )

    expect(findings.map(({ line, severity }) => [line, severity])).toEqual([
      [11, 'minor'],
      [40, 'major'],
      [80, 'minor'],
    ])
    expect(stats).toEqual({ proposed: 3, confirmed: 2, downgraded: 1, dropped: 0, unverified: 0, skipped: 0 })
    expect(options.logger.log).toHaveBeenCalledTimes(1)
    expect(options.logger.log).toHaveBeenCalledWith(
      '[review] Downgraded the critical finding at src/checkout.js:11 to minor (Only on a dead path.)'
    )
  })

  it('posts one finding when two finders reported the same problem, with the higher severity', async () => {
    respondWith({
      F1: verdict('F1', { verdict: 'duplicate', duplicateOf: 'F2', severity: 'major', evidence: 'Same as F2.' }),
      F2: verdict('F2', { severity: 'minor', evidence: 'cart.js:4 trusts the client total.' }),
    })
    const correctness = finding({ severity: 'major', title: 'Total is not recomputed.' })
    const security = finding({ line: 12, severity: 'minor', category: 'security', lens: 'security' })

    const { findings, stats } = await verifyFindings([correctness, security], scope())

    expect(clustersVerified()).toEqual([['F1', 'F2']])
    expect(findings).toEqual([{ ...security, severity: 'major', evidence: 'cart.js:4 trusts the client total.' }])
    expect(stats).toEqual({ proposed: 2, confirmed: 1, downgraded: 0, dropped: 1, unverified: 0, skipped: 0 })
  })

  it('never lets a duplicate raise the kept finding above what the duplicate deserves', async () => {
    respondWith({
      F1: verdict('F1', { verdict: 'duplicate', duplicateOf: 'F2', severity: 'minor' }),
      F2: verdict('F2', { severity: 'minor' }),
    })

    const { findings } = await verifyFindings(
      [finding({ severity: 'critical' }), finding({ severity: 'minor' })],
      scope()
    )

    expect(findings.map(({ severity }) => severity)).toEqual(['minor'])
  })

  it('follows a chain of duplicates and drops a duplicate of a refuted finding', async () => {
    respondWith({
      F1: verdict('F1', { verdict: 'duplicate', duplicateOf: 'F2' }),
      F2: verdict('F2', { verdict: 'duplicate', duplicateOf: 'F3' }),
      F3: verdict('F3'),
      F4: verdict('F4', { verdict: 'duplicate', duplicateOf: 'F5' }),
      F5: verdict('F5', { verdict: 'refuted' }),
    })

    const { findings, stats } = await verifyFindings(
      [finding(), finding(), finding({ title: 'Kept.' }), finding({ line: 50 }), finding({ line: 50 })],
      scope()
    )

    expect(findings.map(({ title }) => title)).toEqual(['Kept.'])
    expect(stats).toEqual({ proposed: 5, confirmed: 1, downgraded: 0, dropped: 4, unverified: 0, skipped: 0 })
  })

  it('keeps a duplicate whose target is not in the cluster or loops back to it', async () => {
    respondWith({
      F1: verdict('F1', { verdict: 'duplicate', duplicateOf: 'F9' }),
      F2: verdict('F2', { verdict: 'duplicate', duplicateOf: 'F3' }),
      F3: verdict('F3', { verdict: 'duplicate', duplicateOf: 'F2' }),
    })

    const { findings } = await verifyFindings([finding(), finding(), finding()], scope())

    expect(findings).toHaveLength(3)
  })

  it('drops a suggestion that is not valid as-is and keeps a valid one', async () => {
    respondWith({
      F1: verdict('F1', { suggestionValid: false }),
      F2: verdict('F2', { suggestionValid: true }),
    })

    const { findings } = await verifyFindings(
      [finding({ suggestion: 'const total = 0' }), finding({ line: 40, suggestion: 'return 0' })],
      scope()
    )

    expect(findings.map(({ suggestion }) => suggestion)).toEqual([null, 'return 0'])
  })

  it('keeps a finding the verifier gave no verdict for, without evidence', async () => {
    respondWith({ F1: verdict('F1') })
    const options = scope()

    const { findings, stats } = await verifyFindings([finding(), finding({ line: 12, severity: 'minor' })], options)

    expect(findings).toEqual([
      { ...finding(), evidence: 'F1 is real: src/checkout.js:11 has no guard.' },
      finding({ line: 12, severity: 'minor' }),
    ])
    expect(stats).toEqual({ proposed: 2, confirmed: 1, downgraded: 0, dropped: 0, unverified: 1, skipped: 0 })
    expect(options.logger.warn).toHaveBeenCalledWith(
      '[review] The verifier gave no verdict for the minor finding at src/checkout.js:12; keeping it as proposed'
    )
  })

  it('applies the verdicts of a verifier that wrapped up and keeps the findings it did not check as proposed', async () => {
    mockRunReviewAgent.mockResolvedValue({ output: { verdicts: [verdict('F1')] }, wrappedUp: true })

    const { findings, stats } = await verifyFindings([finding(), finding({ line: 12 })], scope())

    expect(findings).toEqual([
      { ...finding(), evidence: 'F1 is real: src/checkout.js:11 has no guard.' },
      finding({ line: 12 }),
    ])
    expect(stats).toEqual({ proposed: 2, confirmed: 1, downgraded: 0, dropped: 0, unverified: 1, skipped: 0 })
  })

  it('keeps the findings of a cluster as proposed when its verification fails', async () => {
    mockRunReviewAgent.mockRejectedValue(new Error('model unavailable'))
    const options = scope()

    const { findings, stats } = await verifyFindings([finding(), finding({ line: null })], options)

    expect(findings).toEqual([finding({ line: null }), finding()])
    expect(stats).toEqual({ proposed: 2, confirmed: 0, downgraded: 0, dropped: 0, unverified: 2, skipped: 0 })
    expect(options.logger.warn).toHaveBeenCalledTimes(2)
    expect(options.logger.warn).toHaveBeenCalledWith(
      '[review] Could not verify the major finding at src/checkout.js:11 (model unavailable); keeping it as proposed'
    )
    expect(options.logger.warn).toHaveBeenCalledWith(
      '[review] Could not verify the major finding at src/checkout.js (model unavailable); keeping it as proposed'
    )
  })

  it('verifies the most severe clusters first and at most 30, dropping the minor findings left over', async () => {
    const minors = Array.from({ length: 31 }, (_, index) => finding({ severity: 'minor', line: 10 * (index + 1) }))
    const critical = finding({ path: 'src/auth.js', severity: 'critical', title: 'Skips the auth check.' })
    const options = scope()

    const { findings, stats } = await verifyFindings([...minors, critical], options)

    expect(mockRunReviewAgent).toHaveBeenCalledTimes(30)
    expect(clustersVerified()[0]).toEqual(['F32'])
    expect(stats).toEqual({ proposed: 32, confirmed: 30, downgraded: 0, dropped: 0, unverified: 0, skipped: 2 })
    expect(findings).toHaveLength(30)
    expect(findings.map(({ line }) => line)).not.toContain(300)
    expect(findings.map(({ line }) => line)).not.toContain(310)
    expect(options.logger.warn).toHaveBeenCalledTimes(1)
    expect(options.logger.warn).toHaveBeenCalledWith(
      '[review] Skipped the verification of the minor finding at src/checkout.js:300, the minor finding at src/checkout.js:310: over the limit of 30 clusters; dropping them'
    )
  })

  it('still posts a critical or major finding left over the verification limit, unverified', async () => {
    const majors = Array.from({ length: 31 }, (_, index) => finding({ line: 10 * (index + 1) }))
    const minor = finding({ path: 'src/cart.js', severity: 'minor' })
    const options = scope()

    const { findings, stats } = await verifyFindings([...majors, minor], options)

    expect(mockRunReviewAgent).toHaveBeenCalledTimes(30)
    expect(stats).toEqual({ proposed: 32, confirmed: 30, downgraded: 0, dropped: 0, unverified: 1, skipped: 1 })
    expect(findings).toHaveLength(31)
    expect(findings).toContainEqual(finding({ line: 310 }))
    expect(findings).not.toContainEqual(minor)
    expect(options.logger.warn).toHaveBeenCalledWith(
      '[review] Skipped the verification of the major finding at src/checkout.js:310: over the limit of 30 clusters; posting them unverified'
    )
    expect(options.logger.warn).toHaveBeenCalledWith(
      '[review] Skipped the verification of the minor finding at src/cart.js:11: over the limit of 30 clusters; dropping them'
    )
  })

  it('runs at most 4 verifications at once', async () => {
    const pending = []
    mockRunReviewAgent.mockImplementation(({ task }) => {
      return new Promise(resolve =>
        pending.push(() => resolve({ output: { verdicts: idsOf(task).map(id => verdict(id)) }, wrappedUp: false }))
      )
    })
    const candidates = [10, 20, 30, 40, 50].map(line => finding({ line }))

    const verifying = verifyFindings(candidates, scope())
    await vi.waitFor(() => expect(mockRunReviewAgent).toHaveBeenCalledTimes(4))
    pending.splice(0).forEach(resolve => resolve())
    await vi.waitFor(() => expect(mockRunReviewAgent).toHaveBeenCalledTimes(5))
    pending.splice(0).forEach(resolve => resolve())

    expect((await verifying).findings).toHaveLength(5)
  })

  it('hands the verifier the shared context, the cluster as quoted data and its own tools', async () => {
    const options = scope({ changes: { status: 'incremental', files: [] } })

    await verifyFindings(
      [
        finding({ startLine: 10, line: 12, suggestion: 'const total = sumItems(cart) ?? 0' }),
        finding({ line: 13, category: 'standards', lens: 'standards', body: 'Breaks CLAUDE.md\n## no comments rule' }),
      ],
      options
    )

    expect(mockRunReviewAgent).toHaveBeenCalledTimes(1)
    const [run] = mockRunReviewAgent.mock.calls[0]
    expect(run).toEqual(
      expect.objectContaining({
        name: 'Soporti Review Verifier',
        sharedContext: SHARED_CONTEXT,
        tools: [{ name: 'get_file_contents' }, { name: 'get_file_diff' }],
        channel: 'pr_review_verify',
        subject: 'acme-io/app#7',
        maxTurns: 15,
        logger: options.logger,
      })
    )
    expect(run.signal).toBeInstanceOf(AbortSignal)
    expect(run.instructions).toMatch(/whose job is to try to REFUTE them/)
    expect(mockBuildRepoTools).toHaveBeenCalledWith('acme-io/app', '/tmp/wt-pr-7')
    expect(mockBuildDiffTools).toHaveBeenCalledWith({
      files: FILES,
      changes: { status: 'incremental', files: [] },
      rootPath: '/tmp/wt-pr-7',
      diffBaseSha: 'merge000',
    })
    expect(run.task).toMatch(/^## Your task: verify these findings\n\n/)
    expect(run.task).toContain(
      [
        '### F1 — proposed by the correctness pass',
        '- Path: `src/checkout.js`\n- Lines: 10-12\n- Severity: major\n- Category: bug',
        'Title and body, as the finder wrote them:\n\n> **sumItems throws on an empty cart.**\n> \n> sumItems may throw on an empty cart',
        'Suggestion, replacing lines 10-12:\n\n```\nconst total = sumItems(cart) ?? 0\n```',
      ].join('\n\n')
    )
    expect(run.task).toContain('### F2 — proposed by the standards pass')
    expect(run.task).toContain('> Breaks CLAUDE.md\n> ## no comments rule\n\nSuggestion: none')
  })

  it('parses a structured verdict for every finding of the cluster', async () => {
    await verifyFindings([finding()], scope())

    const { outputType } = mockRunReviewAgent.mock.calls[0][0]
    expect(outputType.parse({ verdicts: [verdict('F1', { verdict: 'pre_existing' })] })).toEqual({
      verdicts: [verdict('F1', { verdict: 'pre_existing' })],
    })
    expect(() => outputType.parse({ verdicts: [verdict('F1', { verdict: 'maybe' })] })).toThrow()
    expect(() => outputType.parse({ verdicts: [verdict('F1', { suggestionValid: undefined })] })).toThrow()
  })

  it('never runs with more turns than the review limit', async () => {
    mockConfig.review.maxTurns = 8

    await verifyFindings([finding()], scope())

    expect(mockRunReviewAgent.mock.calls[0][0].maxTurns).toBe(8)
  })

  it('aborts the running verifications and starts no new one when the review is superseded', async () => {
    const controller = new AbortController()
    mockRunReviewAgent.mockImplementation(runUntilAborted)
    const candidates = [10, 20, 30, 40, 50].map(line => finding({ line }))

    const verifying = verifyFindings(candidates, scope({ signal: controller.signal }))
    await vi.waitFor(() => expect(mockRunReviewAgent).toHaveBeenCalledTimes(4))
    controller.abort()

    await expect(verifying).rejects.toThrow('aborted')
    expect(mockRunReviewAgent).toHaveBeenCalledTimes(4)
  })
})
