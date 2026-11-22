import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const acquireBranchWorktree = vi.fn()
vi.mock('../repo-pool/index.js', () => ({ pool: { basePath: '/var/soporti-repos', acquireBranchWorktree } }))

vi.mock('./git.js', async () => {
  const actual = await vi.importActual('./git.js')
  return { ...actual, readHead: vi.fn(async () => 'sha-start') }
})

const { getCodeChangeSession, _resetCodeChangeSessionsForTests } = await import('./index.js')

const REPO = 'acme/app'
const MINUTE_MS = 60_000
const EXPIRED_MESSAGE = 'This code change session expired after an hour without activity'

let worktree
let release

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  worktree = await mkdtemp(join(tmpdir(), 'soporti-change-registry-'))
  release = vi.fn(async () => {})
  acquireBranchWorktree.mockReset()
  acquireBranchWorktree.mockResolvedValue({ localPath: worktree, baseBranch: 'main', release })
})

afterEach(async () => {
  await _resetCodeChangeSessionsForTests()
  vi.useRealTimers()
  await rm(worktree, { recursive: true, force: true })
})

describe('getCodeChangeSession', () => {
  it('returns the same session for the same key and a different one for another key', () => {
    const first = getCodeChangeSession('conversation-1')

    expect(getCodeChangeSession('conversation-1')).toBe(first)
    expect(getCodeChangeSession('conversation-2')).not.toBe(first)
  })

  it.each([undefined, null, ''])('refuses the missing key %j', key => {
    expect(() => getCodeChangeSession(key)).toThrow('A code change session needs a key.')
  })

  it('drops a session idle for an hour and releases its worktrees', async () => {
    const session = getCodeChangeSession('conversation-1')
    await session.writeFile(REPO, 'a.txt', 'x\n')

    vi.advanceTimersByTime(55 * MINUTE_MS)
    expect(release).not.toHaveBeenCalled()

    vi.advanceTimersByTime(10 * MINUTE_MS)
    await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(1))

    expect(getCodeChangeSession('conversation-1')).not.toBe(session)
    await expect(session.writeFile(REPO, 'b.txt', 'x\n')).rejects.toThrow(EXPIRED_MESSAGE)
  })

  it('keeps a session that is used again within the hour', async () => {
    const session = getCodeChangeSession('conversation-1')
    await session.writeFile(REPO, 'a.txt', 'x\n')

    vi.advanceTimersByTime(50 * MINUTE_MS)
    getCodeChangeSession('conversation-1')
    vi.advanceTimersByTime(50 * MINUTE_MS)

    expect(getCodeChangeSession('conversation-1')).toBe(session)
    expect(release).not.toHaveBeenCalled()
  })

  it('never drops a session while one of its operations is running', async () => {
    let finishOpening
    acquireBranchWorktree.mockReturnValue(
      new Promise(resolve => {
        finishOpening = () => resolve({ localPath: worktree, baseBranch: 'main', release })
      })
    )
    const session = getCodeChangeSession('conversation-1')
    const writing = session.writeFile(REPO, 'a.txt', 'x\n')
    await vi.waitFor(() => expect(acquireBranchWorktree).toHaveBeenCalledTimes(1))

    vi.advanceTimersByTime(2 * 60 * MINUTE_MS)
    finishOpening()

    expect(await writing).toEqual({ path: 'a.txt', created: true })
    expect(getCodeChangeSession('conversation-1')).toBe(session)
    expect(release).not.toHaveBeenCalled()
  })

  it('replaces an expired session the sweep has not reached yet', async () => {
    const session = getCodeChangeSession('conversation-1')
    await session.writeFile(REPO, 'a.txt', 'x\n')

    vi.setSystemTime(Date.now() + 61 * MINUTE_MS)
    const replacement = getCodeChangeSession('conversation-1')

    expect(replacement).not.toBe(session)
    await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(1))
    await expect(session.writeFile(REPO, 'b.txt', 'x\n')).rejects.toThrow(EXPIRED_MESSAGE)
  })

  it('logs instead of crashing when an expired session cannot be released', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('worktree is busy')
    release.mockRejectedValue(failure)
    const session = getCodeChangeSession('conversation-1')
    await session.writeFile(REPO, 'a.txt', 'x\n')

    vi.advanceTimersByTime(65 * MINUTE_MS)

    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1))
    expect(consoleError).toHaveBeenCalledWith('Failed to release an expired code change session:', failure)
    consoleError.mockRestore()
  })
})

describe('_resetCodeChangeSessionsForTests', () => {
  it('releases every session and clears the registry', async () => {
    const session = getCodeChangeSession('conversation-1')
    await session.writeFile(REPO, 'a.txt', 'x\n')

    await _resetCodeChangeSessionsForTests()

    expect(release).toHaveBeenCalledTimes(1)
    expect(getCodeChangeSession('conversation-1')).not.toBe(session)
  })
})
