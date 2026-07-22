import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RepoPool } from './pool.js'

vi.mock('node:child_process', () => ({
  execFile: vi.fn((cmd, args, opts, cb) => {
    if (cb) cb(null, { stdout: '', stderr: '' })
  }),
}))

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => {}),
  rm: vi.fn(async () => {}),
}))

describe('RepoPool', () => {
  let pool

  beforeEach(() => {
    pool = new RepoPool({
      maxSize: 3,
      ttlMs: 1000,
      cleanupMs: 999999,
      basePath: '/tmp/test-repos',
      getGithubToken: async () => 'test-token',
    })
  })

  afterEach(async () => {
    await pool.shutdown()
  })

  it('acquires a repo and returns handle with localPath and release', async () => {
    const handle = await pool.acquire('owner/repo')
    expect(handle.localPath).toContain('owner--repo')
    expect(typeof handle.release).toBe('function')
    handle.release()
  })

  it('reuses existing entry on second acquire', async () => {
    const h1 = await pool.acquire('owner/repo')
    const h2 = await pool.acquire('owner/repo')
    expect(h1.localPath).toBe(h2.localPath)
    expect(pool.entries.get('owner/repo').refCount).toBe(2)
    h1.release()
    h2.release()
  })

  it('release is idempotent', async () => {
    const handle = await pool.acquire('owner/repo')
    handle.release()
    handle.release()
    expect(pool.entries.get('owner/repo').refCount).toBe(0)
  })

  it('tracks refCount correctly', async () => {
    const h1 = await pool.acquire('owner/repo')
    expect(pool.entries.get('owner/repo').refCount).toBe(1)
    const h2 = await pool.acquire('owner/repo')
    expect(pool.entries.get('owner/repo').refCount).toBe(2)
    h1.release()
    expect(pool.entries.get('owner/repo').refCount).toBe(1)
    h2.release()
    expect(pool.entries.get('owner/repo').refCount).toBe(0)
  })

  it('evicts LRU when pool is full', async () => {
    const h1 = await pool.acquire('a/1')
    h1.release()
    const h2 = await pool.acquire('a/2')
    h2.release()
    const h3 = await pool.acquire('a/3')
    h3.release()

    const h4 = await pool.acquire('a/4')
    h4.release()
    expect(pool.entries.has('a/1')).toBe(false)
    expect(pool.entries.has('a/4')).toBe(true)
  })

  it('throws when pool is full and all entries are in use', async () => {
    const handles = []
    for (let i = 0; i < 3; i++) {
      handles.push(await pool.acquire(`owner/repo${i}`))
    }
    await expect(pool.acquire('owner/new')).rejects.toThrow('all entries are in use')
    for (const h of handles) h.release()
  })

  it('cleanup removes expired idle entries', async () => {
    const h = await pool.acquire('owner/repo')
    h.release()
    pool.entries.get('owner/repo').lastRelease = Date.now() - 2000
    pool._cleanup()
    expect(pool.entries.has('owner/repo')).toBe(false)
  })

  it('cleanup does not remove entries with active refs', async () => {
    const h = await pool.acquire('owner/repo')
    pool._cleanup()
    expect(pool.entries.has('owner/repo')).toBe(true)
    h.release()
  })

  it('shutdown clears all entries', async () => {
    await pool.acquire('owner/repo')
    await pool.shutdown()
    expect(pool.entries.size).toBe(0)
  })

  describe('acquireWorktree', () => {
    beforeEach(async () => {
      const { execFile } = await import('node:child_process')
      execFile.mockClear()
    })

    async function gitCalls() {
      const { execFile } = await import('node:child_process')
      return execFile.mock.calls.filter(c => c[0] === 'git').map(c => c[1])
    }

    it('checks out the PR head in a worktree and pins the clone while held', async () => {
      const wt = await pool.acquireWorktree('owner/repo', 7)

      expect(wt.localPath).toContain('pr-7')
      expect(wt.localPath).not.toBe(pool.entries.get('owner/repo').localPath)
      expect(pool.entries.get('owner/repo').refCount).toBe(1)

      const calls = await gitCalls()
      expect(calls.some(args => args.includes('fetch') && args.some(a => a.includes('refs/pull/7/head')))).toBe(true)
      expect(calls.some(args => args.includes('worktree') && args.includes('add') && args.includes(wt.localPath))).toBe(
        true
      )

      await wt.release()
      expect(pool.entries.get('owner/repo').refCount).toBe(0)
      const after = await gitCalls()
      expect(after.some(args => args.includes('worktree') && args.includes('remove'))).toBe(true)
    })

    it('release is idempotent and removes the worktree once', async () => {
      const wt = await pool.acquireWorktree('owner/repo', 7)
      await wt.release()
      await wt.release()
      const removes = (await gitCalls()).filter(args => args.includes('worktree') && args.includes('remove'))
      expect(removes.length).toBe(1)
      expect(pool.entries.get('owner/repo').refCount).toBe(0)
    })

    it('gives concurrent reviews of the same PR independent worktrees', async () => {
      const a = await pool.acquireWorktree('owner/repo', 7)
      const b = await pool.acquireWorktree('owner/repo', 7)
      expect(a.localPath).not.toBe(b.localPath)
      await a.release()
      await b.release()
    })

    it('releases the clone when the head fetch fails', async () => {
      const { execFile } = await import('node:child_process')
      execFile.mockImplementationOnce((cmd, args, opts, cb) => {
        if (cb) cb(null, { stdout: '', stderr: '' })
      })
      execFile.mockImplementationOnce((cmd, args, opts, cb) => {
        if (cb) cb(new Error('fatal: could not fetch'))
      })

      await expect(pool.acquireWorktree('owner/repo', 9)).rejects.toThrow(/worktree/i)
      expect(pool.entries.get('owner/repo').refCount).toBe(0)
    })

    it('rejects invalid PR numbers without touching the pool', async () => {
      await expect(pool.acquireWorktree('owner/repo', 'nope')).rejects.toThrow(/pr number/i)
      expect(pool.entries.has('owner/repo')).toBe(false)
    })
  })
})
