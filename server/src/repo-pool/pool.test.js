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
  describe('acquireBranchWorktree', () => {
    const CLONE_PATH = '/tmp/test-repos/owner--repo'

    function succeed(cb, stdout = '') {
      if (cb) cb(null, { stdout, stderr: '' })
    }

    beforeEach(async () => {
      const { execFile } = await import('node:child_process')
      execFile.mockClear()
      execFile.mockImplementation((cmd, args, opts, cb) => succeed(cb, args.includes('rev-parse') ? 'main\n' : ''))
    })

    afterEach(async () => {
      const { execFile } = await import('node:child_process')
      execFile.mockImplementation((cmd, args, opts, cb) => succeed(cb))
    })

    async function gitCalls() {
      const { execFile } = await import('node:child_process')
      return execFile.mock.calls.filter(c => c[0] === 'git').map(c => c[1])
    }

    function localRefOf(calls) {
      const fetch = calls.find(args => args.includes('fetch'))
      return fetch.at(-1).split(':')[1]
    }

    it('checks out the latest default branch tip in a fresh worktree and pins the clone while held', async () => {
      const wt = await pool.acquireBranchWorktree('owner/repo')

      expect(wt.baseBranch).toBe('main')
      expect(wt.localPath).toMatch(/^\/tmp\/test-repos\/owner--repo--change-[a-z0-9]+$/)
      expect(pool.entries.get('owner/repo').refCount).toBe(1)

      const calls = await gitCalls()
      const localRef = localRefOf(calls)
      expect(localRef).toMatch(/^refs\/soporti\/change-[a-z0-9]+$/)
      expect(calls).toContainEqual(['-C', CLONE_PATH, 'rev-parse', '--abbrev-ref', 'HEAD'])
      expect(calls).toContainEqual([
        '-C',
        CLONE_PATH,
        'fetch',
        '--depth',
        '1',
        'origin',
        `+refs/heads/main:${localRef}`,
      ])
      expect(calls).toContainEqual(['-C', CLONE_PATH, 'worktree', 'add', '--detach', wt.localPath, localRef])

      await wt.release()

      const after = await gitCalls()
      expect(after).toContainEqual(['-C', CLONE_PATH, 'worktree', 'remove', '--force', wt.localPath])
      expect(after).toContainEqual(['-C', CLONE_PATH, 'update-ref', '-d', localRef])
      expect(pool.entries.get('owner/repo').refCount).toBe(0)
    })

    it('starts from the requested branch while still reporting the default branch', async () => {
      const wt = await pool.acquireBranchWorktree('owner/repo', { branch: 'soporti/fix-typo-abc123' })

      const calls = await gitCalls()
      const localRef = localRefOf(calls)
      expect(wt.baseBranch).toBe('main')
      expect(calls).toContainEqual([
        '-C',
        CLONE_PATH,
        'fetch',
        '--depth',
        '1',
        'origin',
        `+refs/heads/soporti/fix-typo-abc123:${localRef}`,
      ])
      await wt.release()
    })

    it('gives every change its own worktree and local ref', async () => {
      const a = await pool.acquireBranchWorktree('owner/repo')
      const b = await pool.acquireBranchWorktree('owner/repo')

      const fetches = (await gitCalls()).filter(args => args.includes('fetch'))
      expect(a.localPath).not.toBe(b.localPath)
      expect(fetches).toHaveLength(2)
      expect(fetches[0].at(-1)).not.toBe(fetches[1].at(-1))
      expect(pool.entries.get('owner/repo').refCount).toBe(2)
      await a.release()
      await b.release()
    })

    it('release is idempotent and removes the worktree once', async () => {
      const wt = await pool.acquireBranchWorktree('owner/repo')

      await wt.release()
      await wt.release()

      const removes = (await gitCalls()).filter(args => args.includes('worktree') && args.includes('remove'))
      expect(removes).toHaveLength(1)
      expect(pool.entries.get('owner/repo').refCount).toBe(0)
    })

    it('deletes the worktree folder when git cannot remove it', async () => {
      const { execFile } = await import('node:child_process')
      const { rm } = await import('node:fs/promises')
      const wt = await pool.acquireBranchWorktree('owner/repo')
      execFile.mockImplementation((cmd, args, opts, cb) => {
        if (args.includes('remove')) return cb(new Error('fatal: not a working tree'))
        succeed(cb)
      })
      rm.mockClear()

      await wt.release()

      expect(rm).toHaveBeenCalledWith(wt.localPath, { recursive: true, force: true })
      expect(pool.entries.get('owner/repo').refCount).toBe(0)
    })

    it('releases the clone and hides the token and clone path when the fetch fails', async () => {
      const { execFile } = await import('node:child_process')
      execFile.mockImplementation((cmd, args, opts, cb) => {
        if (args.includes('rev-parse')) return succeed(cb, 'main\n')
        if (!args.includes('fetch')) return succeed(cb)
        const err = new Error(`Command failed: git -C ${CLONE_PATH} fetch https://x-access-token:test-token@github.com`)
        err.stderr = `fatal: couldn't find remote ref refs/heads/soporti/gone in ${CLONE_PATH}/.git\n`
        cb(err)
      })

      const failure = await pool.acquireBranchWorktree('owner/repo', { branch: 'soporti/gone' }).catch(err => err)

      expect(failure.message).toBe(
        "Could not check out soporti/gone of owner/repo: fatal: couldn't find remote ref refs/heads/soporti/gone in owner--repo/.git"
      )
      expect(pool.entries.get('owner/repo').refCount).toBe(0)
      expect((await gitCalls()).some(args => args.includes('update-ref') && args.includes('-d'))).toBe(true)
    })

    it('falls back to the masked error message when git prints nothing', async () => {
      const { execFile } = await import('node:child_process')
      execFile.mockImplementation((cmd, args, opts, cb) => {
        if (args.includes('rev-parse')) return succeed(cb, 'main\n')
        if (args.includes('worktree')) return cb(new Error('push https://x-access-token:test-token@github.com failed'))
        succeed(cb)
      })

      const failure = await pool.acquireBranchWorktree('owner/repo').catch(err => err)

      expect(failure.message).toBe(
        'Could not check out the default branch of owner/repo: push https://x-access-token:***@github.com failed'
      )
    })

    it('refuses a clone with no branch checked out', async () => {
      const { execFile } = await import('node:child_process')
      execFile.mockImplementation((cmd, args, opts, cb) => succeed(cb, args.includes('rev-parse') ? 'HEAD\n' : ''))

      await expect(pool.acquireBranchWorktree('owner/repo')).rejects.toThrow(
        'Could not check out the default branch of owner/repo: The clone has no default branch checked out.'
      )
      expect(pool.entries.get('owner/repo').refCount).toBe(0)
    })

    it('hides the clone path and token when the clone fails', async () => {
      const { execFile } = await import('node:child_process')
      execFile.mockImplementation((cmd, args, opts, cb) => {
        if (args[0] === 'clone') return cb(new Error(`fatal: ${args[3]} into ${args[4]} failed`))
        succeed(cb)
      })

      const failure = await pool.acquireBranchWorktree('owner/repo').catch(err => err)

      expect(failure.message).toBe(
        'Clone failed for owner/repo: fatal: https://x-access-token:***@github.com/owner/repo.git into owner--repo failed'
      )
    })

    it.each([
      '../main',
      '-delete',
      'has space',
      'refs/heads/main',
      'a..b',
      'line\nbreak',
      'trailing/',
      'trailing.',
      '.hidden',
      'dir/.hidden',
      'branch.lock',
      'HEAD',
      '',
      'double//slash',
      'tilde~1',
      'colon:name',
      'x'.repeat(256),
    ])('rejects the unsafe branch name %j without touching the pool', async branch => {
      await expect(pool.acquireBranchWorktree('owner/repo', { branch })).rejects.toThrow('Invalid branch name')
      expect(pool.entries.has('owner/repo')).toBe(false)
      expect(await gitCalls()).toEqual([])
    })
  })
})
