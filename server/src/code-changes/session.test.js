import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const getAuthenticatedUser = vi.fn()
const getPullRequest = vi.fn()
const createPullRequest = vi.fn()
vi.mock('../github/client.js', () => ({ getAuthenticatedUser, getPullRequest, createPullRequest }))

const areGithubWritesEnabled = vi.fn()
vi.mock('../github/settings.js', () => ({ getGithubToken: async () => 'test-token', areGithubWritesEnabled }))

vi.mock('../repo-pool/index.js', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir: osTmpdir } = await import('node:os')
  const { join: joinPath } = await import('node:path')
  const { RepoPool } = await vi.importActual('../repo-pool/pool.js')
  const basePath = mkdtempSync(joinPath(osTmpdir(), 'soporti-change-pool-'))

  return { pool: new RepoPool({ basePath, cleanupMs: 3_600_000, getGithubToken: async () => 'test-token' }) }
})

const { pool } = await import('../repo-pool/index.js')
const { CodeChangeSession } = await import('./session.js')

const REPO = 'acme/app'
const BRANCH_RE = /^soporti\/say-hi-instead-of-hello-[a-z0-9]{6}$/
const EXISTING_BRANCH = 'soporti/existing-notes-abc123'
const APP_SOURCE = 'export function greet() {\n  return "hello"\n}\n'
const ISOLATED_GIT_ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_COUNT: '1' }
const SEED_IDENTITY = ['-c', 'user.name=Seed', '-c', 'user.email=seed@example.com']

const savedEnv = {}
let base
let origin
let seed
let session

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
}

function originGit(...args) {
  return execFileSync('git', ['--git-dir', origin, ...args], { encoding: 'utf8' }).trim()
}

async function seedCommit(files, message) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(seed, path)), { recursive: true })
    await writeFile(join(seed, path), content)
  }
  git(seed, 'add', '--all')
  git(seed, ...SEED_IDENTITY, 'commit', '--quiet', '-m', message)
}

function openPullRequestFixture(overrides = {}) {
  return {
    number: 5,
    state: 'open',
    merged_at: null,
    html_url: 'https://github.com/acme/app/pull/5',
    title: 'Existing notes',
    draft: true,
    head: { ref: EXISTING_BRANCH, repo: { full_name: REPO } },
    ...overrides,
  }
}

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'soporti-code-changes-'))
  const origins = join(base, 'origins')
  origin = join(origins, 'acme', 'app.git')
  seed = join(base, 'seed')

  const env = {
    ...ISOLATED_GIT_ENV,
    GIT_CONFIG_KEY_0: `url.file://${origins}/.insteadOf`,
    GIT_CONFIG_VALUE_0: 'https://x-access-token:test-token@github.com/',
  }
  for (const [key, value] of Object.entries(env)) {
    savedEnv[key] = process.env[key]
    process.env[key] = value
  }

  execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', origin])
  execFileSync('git', ['init', '--quiet', '--initial-branch=main', seed])
  await seedCommit(
    {
      'README.md': '# App\n',
      'src/app.js': APP_SOURCE,
      'src/old.js': 'old\n',
      '.github/workflows/ci.yml': 'on: push\n',
    },
    'Seed'
  )
  await symlink('../outside', join(seed, 'link-out'))
  git(seed, 'add', '--all')
  git(seed, ...SEED_IDENTITY, 'commit', '--quiet', '-m', 'Add a link')
  git(seed, 'push', '--quiet', origin, 'main')

  git(seed, 'switch', '--quiet', '-c', EXISTING_BRANCH)
  await seedCommit({ 'docs/notes.md': 'Notes\n' }, 'Existing notes')
  git(seed, 'push', '--quiet', origin, EXISTING_BRANCH)
  git(seed, 'switch', '--quiet', 'main')
})

afterAll(async () => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await pool.shutdown()
  await rm(base, { recursive: true, force: true })
})

beforeEach(() => {
  vi.clearAllMocks()
  areGithubWritesEnabled.mockResolvedValue(true)
  getAuthenticatedUser.mockResolvedValue({ login: 'soporti-bot', id: 42, name: 'Soporti Bot' })
  getPullRequest.mockResolvedValue(openPullRequestFixture())
  createPullRequest.mockImplementation(async (repo, { title }) => ({
    number: 12,
    url: 'https://github.com/acme/app/pull/12',
    title,
    draft: true,
  }))
  session = new CodeChangeSession()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await session.dispose()
})

describe('CodeChangeSession', () => {
  it('opens a change on the first edit and reuses it for later edits', async () => {
    expect(session.pendingPath(REPO)).toBeNull()

    const edit = await session.editFile(REPO, 'src/app.js', { oldText: '"hello"', newText: '"hi"' })
    const localPath = session.pendingPath(REPO)
    const write = await session.writeFile(REPO, 'src/new.js', 'export const answer = 42\n')

    expect(edit).toEqual({
      path: 'src/app.js',
      replacements: 1,
      preview: '1\texport function greet() {\n2\t  return "hi"\n3\t}\n4\t',
    })
    expect(write).toEqual({ path: 'src/new.js', created: true })
    expect(session.pendingPath(REPO)).toBe(localPath)
    expect(session.pendingPath('ACME/app')).toBe(localPath)
    expect(session.pendingPath('acme/other')).toBeNull()
    expect(session.pendingPath(undefined)).toBeNull()
    expect(await readFile(join(localPath, 'src', 'app.js'), 'utf8')).toContain('"hi"')
    expect(pool.entries.get(REPO).refCount).toBe(1)
  })

  it('starts every change from the default branch on GitHub even when the cached clone is stale', async () => {
    await session.writeFile(REPO, 'a.txt', 'a\n')
    await seedCommit({ 'CHANGELOG.md': '# Changelog\n' }, 'Add a changelog')
    git(seed, 'push', '--quiet', origin, 'main')
    const later = new CodeChangeSession()

    await later.writeFile(REPO, 'b.txt', 'b\n')

    expect(existsSync(join(later.pendingPath(REPO), 'CHANGELOG.md'))).toBe(true)
    expect(existsSync(join(session.pendingPath(REPO), 'CHANGELOG.md'))).toBe(false)
    await later.dispose()
  })

  it('runs parallel edits to the same file one after another', async () => {
    await Promise.all([
      session.editFile(REPO, 'src/app.js', { oldText: 'greet', newText: 'welcome' }),
      session.editFile(REPO, 'src/app.js', { oldText: '"hello"', newText: '"hi"' }),
    ])

    expect(await readFile(join(session.pendingPath(REPO), 'src', 'app.js'), 'utf8')).toBe(
      'export function welcome() {\n  return "hi"\n}\n'
    )
  })

  it('keeps going after a failed edit', async () => {
    const results = await Promise.allSettled([
      session.editFile(REPO, 'src/app.js', { oldText: 'missing', newText: 'x' }),
      session.deleteFile(REPO, 'src/old.js'),
    ])

    expect(results.map(result => result.status)).toEqual(['rejected', 'fulfilled'])
    expect(results[1].value).toEqual({ path: 'src/old.js' })
    expect(existsSync(join(session.pendingPath(REPO), 'src', 'old.js'))).toBe(false)
  })

  it('refuses workflow files before opening a change', async () => {
    await expect(session.writeFile(REPO, '.GitHub/workflows/ci.yml', 'on: pull_request\n')).rejects.toThrow(
      'Workflow and CI files are off-limits'
    )
    expect(session.pendingPath(REPO)).toBeNull()
  })

  it('refuses to write through a link in the repository without leaking the worktree path', async () => {
    const failure = await session.writeFile(REPO, 'link-out/evil.txt', 'x').catch(err => err)

    expect(failure.message).toBe(
      '"link-out" is a symbolic link. Soporti never writes through links: use the real path of the file instead.'
    )
    expect(existsSync(join(base, 'outside'))).toBe(false)
  })

  it('keeps the worktree and clone paths out of filesystem errors', async () => {
    await session.writeFile(REPO, 'locked/file.txt', 'x\n')
    await chmod(join(session.pendingPath(REPO), 'locked'), 0o500)

    const failure = await session.writeFile(REPO, 'locked/other.txt', 'y\n').catch(err => err)

    await chmod(join(session.pendingPath(REPO), 'locked'), 0o700)
    expect(failure.message).toContain('EACCES')
    expect(failure.message).not.toContain(pool.basePath)
    expect(failure.message).not.toContain(session.pendingPath(REPO))
  })

  it('opens a draft pull request with every edit on a new soporti branch', async () => {
    const mainBefore = originGit('rev-parse', 'main')
    await session.editFile(REPO, 'src/app.js', { oldText: '"hello"', newText: '"hi"' })
    await session.writeFile(REPO, 'src/new.js', 'export const answer = 42\n')
    await session.deleteFile(REPO, 'src/old.js')

    const result = await session.openPullRequest(REPO, {
      title: 'Say hi instead of hello',
      body: 'Friendlier.',
      requestedBy: 'Ana',
    })

    expect(result).toEqual({
      number: 12,
      url: 'https://github.com/acme/app/pull/12',
      title: 'Say hi instead of hello',
      branch: expect.stringMatching(BRANCH_RE),
      draft: true,
      created: true,
      files: [
        { path: 'src/app.js', status: 'modified' },
        { path: 'src/new.js', status: 'added' },
        { path: 'src/old.js', status: 'deleted' },
      ],
    })
    expect(createPullRequest).toHaveBeenCalledTimes(1)
    expect(createPullRequest).toHaveBeenCalledWith(REPO, {
      title: 'Say hi instead of hello',
      body: 'Friendlier.\n\n---\n_Opened by Soporti for Ana._',
      head: result.branch,
      base: 'main',
    })
    expect(originGit('log', '-1', '--format=%an|%ae|%s', result.branch)).toBe(
      'Soporti Bot|42+soporti-bot@users.noreply.github.com|Say hi instead of hello'
    )
    expect(originGit('rev-parse', `${result.branch}^`)).toBe(mainBefore)
    expect(originGit('rev-parse', 'main')).toBe(mainBefore)
    expect(originGit('show', `${result.branch}:src/app.js`)).toContain('"hi"')
  })

  it('adds later edits in the same session to the pull request it opened', async () => {
    await session.writeFile(REPO, 'src/new.js', 'export const answer = 42\n')
    const first = await session.openPullRequest(REPO, { title: 'Say hi instead of hello', body: '' })
    const firstTip = originGit('rev-parse', first.branch)

    await session.editFile(REPO, 'README.md', { oldText: '# App', newText: '# Greeter' })
    const second = await session.openPullRequest(REPO, { title: 'Rename the readme title', body: '' })

    expect(second).toEqual({ ...first, created: false, files: [{ path: 'README.md', status: 'modified' }] })
    expect(createPullRequest).toHaveBeenCalledTimes(1)
    expect(originGit('rev-parse', `${first.branch}^`)).toBe(firstTip)
    expect(originGit('log', '-1', '--format=%s', first.branch)).toBe('Rename the readme title')
  })

  it('refuses to publish before any edit and after edits that changed nothing', async () => {
    await expect(session.openPullRequest(REPO, { title: 'Nothing', body: '' })).rejects.toThrow(
      'There are no edits to publish in acme/app. Make them with edit_file, write_file or delete_file first.'
    )

    await session.editFile(REPO, 'src/app.js', { oldText: 'nope', newText: 'x' }).catch(() => {})

    expect(session.pendingPath(REPO)).not.toBeNull()
    await expect(session.openPullRequest(REPO, { title: 'Nothing', body: '' })).rejects.toThrow(
      'There are no edits to publish in acme/app.'
    )
  })

  it('never runs repository hooks when it commits and pushes', async () => {
    await session.writeFile(REPO, 'hooks.txt', 'x\n')
    const clonePath = pool.entries.get(REPO).localPath
    const hooks = join(base, 'hooks')
    const marker = join(base, 'hook-ran')
    await mkdir(hooks, { recursive: true })
    for (const hook of ['pre-commit', 'commit-msg', 'post-commit', 'pre-push', 'reference-transaction']) {
      await writeFile(join(hooks, hook), `#!/bin/sh\ntouch "${marker}"\n`)
      await chmod(join(hooks, hook), 0o755)
    }
    git(clonePath, 'config', 'core.hooksPath', hooks)

    const result = await session
      .openPullRequest(REPO, { title: 'Say hi instead of hello', body: '' })
      .finally(() => git(clonePath, 'config', '--unset', 'core.hooksPath'))

    expect(result.created).toBe(true)
    expect(existsSync(marker)).toBe(false)
  })

  it('explains the token needs write access when GitHub refuses the push and publishes on retry', async () => {
    const hook = join(origin, 'hooks', 'pre-receive')
    await writeFile(hook, '#!/bin/sh\necho "Permission to acme/app.git denied to soporti-bot." >&2\nexit 1\n')
    await chmod(hook, 0o755)
    await session.writeFile(REPO, 'retry.txt', 'x\n')

    await expect(session.openPullRequest(REPO, { title: 'Retry the push', body: '' })).rejects.toThrow(
      'the GitHub token needs write access to this repository (Contents and Pull requests: read and write)'
    )
    expect(createPullRequest).not.toHaveBeenCalled()

    await rm(hook)
    const result = await session.openPullRequest(REPO, { title: 'Retry the push', body: '' })

    expect(result.created).toBe(true)
    expect(result.files).toEqual([{ path: 'retry.txt', status: 'added' }])
    expect(originGit('show', `${result.branch}:retry.txt`)).toBe('x')
  })

  it('opens the pull request on retry when GitHub refused it after the push', async () => {
    createPullRequest.mockRejectedValueOnce(Object.assign(new Error('Validation Failed'), { status: 422 }))
    await session.writeFile(REPO, 'pr-retry.txt', 'x\n')

    await expect(session.openPullRequest(REPO, { title: 'Retry the PR', body: '' })).rejects.toThrow(
      'GitHub refused to open the pull request: Validation Failed'
    )
    const result = await session.openPullRequest(REPO, { title: 'Retry the PR', body: '' })

    expect(createPullRequest).toHaveBeenCalledTimes(2)
    expect(createPullRequest.mock.calls[1][1].head).toBe(createPullRequest.mock.calls[0][1].head)
    expect(result).toMatchObject({ created: true, files: [{ path: 'pr-retry.txt', status: 'added' }] })
  })

  it('refuses to publish once GitHub writes are turned off', async () => {
    const branchesBefore = originGit('for-each-ref', 'refs/heads/soporti')
    areGithubWritesEnabled.mockResolvedValue(false)
    await session.writeFile(REPO, 'off.txt', 'x\n')

    await expect(session.openPullRequest(REPO, { title: 'Writes are off', body: '' })).rejects.toThrow(
      'Opening pull requests is turned off.'
    )
    expect(originGit('for-each-ref', 'refs/heads/soporti')).toBe(branchesBefore)
  })

  it('continues an open soporti pull request and pushes on top of it', async () => {
    const tipBefore = originGit('rev-parse', EXISTING_BRANCH)

    const continued = await session.continuePullRequest(REPO, 5)
    await session.editFile(REPO, 'docs/notes.md', { oldText: 'Notes', newText: 'Better notes' })
    const result = await session.openPullRequest(REPO, { title: 'Improve the notes', body: '' })

    expect(continued).toEqual({
      number: 5,
      url: 'https://github.com/acme/app/pull/5',
      title: 'Existing notes',
      branch: EXISTING_BRANCH,
    })
    expect(getPullRequest).toHaveBeenCalledWith(REPO, 5)
    expect(result).toEqual({
      ...continued,
      draft: true,
      created: false,
      files: [{ path: 'docs/notes.md', status: 'modified' }],
    })
    expect(createPullRequest).not.toHaveBeenCalled()
    expect(originGit('rev-parse', `${EXISTING_BRANCH}^`)).toBe(tipBefore)
    expect(originGit('show', `${EXISTING_BRANCH}:docs/notes.md`)).toBe('Better notes')
  })

  it('returns the pull request it already holds without checking it out again', async () => {
    await session.continuePullRequest(REPO, '5')
    const localPath = session.pendingPath(REPO)

    const again = await session.continuePullRequest(REPO, 5)

    expect(again.number).toBe(5)
    expect(getPullRequest).toHaveBeenCalledTimes(1)
    expect(session.pendingPath(REPO)).toBe(localPath)
  })

  it('refuses to continue another pull request while edits are unpublished', async () => {
    await session.writeFile(REPO, 'draft.txt', 'x\n')
    const localPath = session.pendingPath(REPO)

    await expect(session.continuePullRequest(REPO, 5)).rejects.toThrow(
      'There are unpublished edits in acme/app. Publish them with open_pull_request before continuing pull request #5.'
    )
    expect(getPullRequest).not.toHaveBeenCalled()
    expect(session.pendingPath(REPO)).toBe(localPath)
  })

  it('switches to another pull request once its own edits are published', async () => {
    await session.writeFile(REPO, 'published.txt', 'x\n')
    await session.openPullRequest(REPO, { title: 'Publish first', body: '' })
    const publishedPath = session.pendingPath(REPO)

    await session.continuePullRequest(REPO, 5)

    expect(session.pendingPath(REPO)).not.toBe(publishedPath)
    expect(existsSync(publishedPath)).toBe(false)
    expect(existsSync(join(session.pendingPath(REPO), 'docs', 'notes.md'))).toBe(true)
  })

  it('refuses a pull request from a fork', async () => {
    getPullRequest.mockResolvedValue(openPullRequestFixture({ head: { ref: EXISTING_BRANCH, repo: null } }))

    await expect(session.continuePullRequest(REPO, 5)).rejects.toThrow('Pull request #5 comes from a fork.')
    expect(session.pendingPath(REPO)).toBeNull()
  })

  it('reports a pull request branch that is gone without leaking paths or the token', async () => {
    getPullRequest.mockResolvedValue(
      openPullRequestFixture({ head: { ref: 'soporti/gone-abc123', repo: { full_name: REPO } } })
    )

    const failure = await session.continuePullRequest(REPO, 5).catch(err => err)

    expect(failure.message).toMatch(/^Could not check out soporti\/gone-abc123 of acme\/app: /)
    expect(failure.message).not.toContain(pool.basePath)
    expect(failure.message).not.toContain('test-token')
    expect(session.pendingPath(REPO)).toBeNull()
    expect(pool.entries.get(REPO).refCount).toBe(0)
  })

  it('rejects an invalid repository or pull request number', async () => {
    await expect(session.writeFile('not a repo', 'a.txt', 'x')).rejects.toThrow(
      'Invalid repository "not a repo". Expected "owner/repo".'
    )
    await expect(session.continuePullRequest(REPO, 'abc')).rejects.toThrow('Invalid pull request number: abc.')
  })

  it('releases its worktrees when disposed and refuses further work', async () => {
    await session.writeFile(REPO, 'a.txt', 'x\n')
    const localPath = session.pendingPath(REPO)

    await session.dispose()

    expect(existsSync(localPath)).toBe(false)
    expect(pool.entries.get(REPO).refCount).toBe(0)
    expect(session.pendingPath(REPO)).toBeNull()
    await expect(session.writeFile(REPO, 'b.txt', 'x\n')).rejects.toThrow(
      'This code change session expired after an hour without activity'
    )
  })

  it('releases a change that finished opening after the session was disposed', async () => {
    const acquire = pool.acquireBranchWorktree.bind(pool)
    let openedPath = null
    vi.spyOn(pool, 'acquireBranchWorktree').mockImplementationOnce(async (...args) => {
      const worktree = await acquire(...args)
      openedPath = worktree.localPath
      await session.dispose()
      return worktree
    })

    await expect(session.writeFile(REPO, 'a.txt', 'x\n')).rejects.toThrow('This code change session expired')
    expect(existsSync(openedPath)).toBe(false)
    expect(pool.entries.get(REPO).refCount).toBe(0)
  })

  it('releases the worktree when the opened change cannot be read', async () => {
    const release = vi.fn(async () => {})
    vi.spyOn(pool, 'acquireBranchWorktree').mockResolvedValueOnce({
      localPath: join(base, 'not-a-worktree'),
      baseBranch: 'main',
      release,
    })

    await expect(session.writeFile(REPO, 'a.txt', 'x\n')).rejects.toThrow()
    expect(release).toHaveBeenCalledTimes(1)
    expect(session.pendingPath(REPO)).toBeNull()
  })
})
