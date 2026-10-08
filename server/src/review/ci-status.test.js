import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListCheckRuns = vi.fn()
const mockListCommitStatuses = vi.fn()

vi.mock('../github/client.js', () => ({
  listCheckRuns: mockListCheckRuns,
  listCommitStatuses: mockListCommitStatuses,
}))

const { loadCiStatus } = await import('./ci-status.js')

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
const REQUEST = { repoFullName: 'acme-io/app', headSha: 'head9999abc' }

function checkRun(name, overrides = {}) {
  return { name, status: 'completed', conclusion: 'success', title: '', summary: '', ...overrides }
}

describe('loadCiStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads the check runs and commit statuses of the head commit', async () => {
    mockListCheckRuns.mockResolvedValue([checkRun('test')])
    mockListCommitStatuses.mockResolvedValue([{ context: 'ci/circleci', state: 'success', description: 'ok' }])

    const ciStatus = await loadCiStatus(REQUEST, { logger: silentLogger })

    expect(ciStatus).toEqual({
      checks: [
        { name: 'test', state: 'completed', result: 'success', details: '' },
        { name: 'ci/circleci', state: 'completed', result: 'success', details: '' },
      ],
      incomplete: false,
    })
    expect(mockListCheckRuns).toHaveBeenCalledTimes(1)
    expect(mockListCheckRuns).toHaveBeenCalledWith('acme-io/app', 'head9999abc')
    expect(mockListCommitStatuses).toHaveBeenCalledTimes(1)
    expect(mockListCommitStatuses).toHaveBeenCalledWith('acme-io/app', 'head9999abc')
  })

  it('keeps the output of failed checks and lists failures first, then pending checks', async () => {
    mockListCheckRuns.mockResolvedValue([
      checkRun('docs', { conclusion: 'skipped' }),
      checkRun('build', { status: 'in_progress', conclusion: null }),
      checkRun('lint', { conclusion: 'failure', title: '2 problems', summary: 'src/a.js:3 no-unused-vars' }),
      checkRun('e2e', { conclusion: 'timed_out', title: '', summary: '' }),
    ])
    mockListCommitStatuses.mockResolvedValue([
      { context: 'deploy/preview', state: 'pending', description: '' },
      { context: 'ci/circleci', state: 'error', description: 'Build errored' },
    ])

    const { checks } = await loadCiStatus(REQUEST, { logger: silentLogger })

    expect(checks).toEqual([
      { name: 'lint', state: 'failed', result: 'failure', details: '2 problems\nsrc/a.js:3 no-unused-vars' },
      { name: 'e2e', state: 'failed', result: 'timed_out', details: '' },
      { name: 'ci/circleci', state: 'failed', result: 'error', details: 'Build errored' },
      { name: 'build', state: 'pending', result: 'pending (in_progress)', details: '' },
      { name: 'deploy/preview', state: 'pending', result: 'pending', details: '' },
      { name: 'docs', state: 'completed', result: 'skipped', details: '' },
    ])
  })

  it('reports a check run waiting in the pending state without repeating it', async () => {
    mockListCheckRuns.mockResolvedValue([checkRun('deploy', { status: 'pending', conclusion: null })])
    mockListCommitStatuses.mockResolvedValue([])

    const { checks } = await loadCiStatus(REQUEST, { logger: silentLogger })

    expect(checks).toEqual([{ name: 'deploy', state: 'pending', result: 'pending', details: '' }])
  })

  it('reports a completed run without a conclusion as unknown', async () => {
    mockListCheckRuns.mockResolvedValue([checkRun('flaky', { conclusion: null })])
    mockListCommitStatuses.mockResolvedValue([])

    const { checks } = await loadCiStatus(REQUEST, { logger: silentLogger })

    expect(checks).toEqual([{ name: 'flaky', state: 'completed', result: 'unknown', details: '' }])
  })

  it('truncates long failure outputs', async () => {
    mockListCheckRuns.mockResolvedValue([checkRun('test', { conclusion: 'failure', summary: 'x'.repeat(5000) })])
    mockListCommitStatuses.mockResolvedValue([])

    const { checks } = await loadCiStatus(REQUEST, { logger: silentLogger })

    expect(checks[0].details).toBe(`${'x'.repeat(1000)}…`)
  })

  it('keeps the commit statuses and flags the result incomplete when the check runs cannot be loaded', async () => {
    mockListCheckRuns.mockRejectedValue(new Error('Resource not accessible by personal access token'))
    mockListCommitStatuses.mockResolvedValue([{ context: 'ci/circleci', state: 'success', description: '' }])

    const ciStatus = await loadCiStatus(REQUEST, { logger: silentLogger })

    expect(ciStatus).toEqual({
      checks: [{ name: 'ci/circleci', state: 'completed', result: 'success', details: '' }],
      incomplete: true,
    })
    expect(silentLogger.warn).toHaveBeenCalledTimes(1)
    expect(silentLogger.warn).toHaveBeenCalledWith(
      '[review] Could not load the check runs of acme-io/app@head999 (Resource not accessible by personal access token); reviewing without them'
    )
  })

  it('returns null and warns twice when neither source can be loaded', async () => {
    mockListCheckRuns.mockRejectedValue(new Error('Forbidden'))
    mockListCommitStatuses.mockRejectedValue(new Error('Forbidden'))

    const ciStatus = await loadCiStatus(REQUEST, { logger: silentLogger })

    expect(ciStatus).toBeNull()
    expect(silentLogger.warn).toHaveBeenCalledTimes(2)
    expect(silentLogger.warn).toHaveBeenCalledWith(
      '[review] Could not load the commit statuses of acme-io/app@head999 (Forbidden); reviewing without them'
    )
  })
})
