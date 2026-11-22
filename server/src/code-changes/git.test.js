import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commitAll, gitErrorDetail, hasUncommittedChanges, listChangedFiles, pushHead, readHead } from './git.js'

const ISOLATED_GIT_ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
const AUTHOR = { name: 'Soporti Bot', email: '42+soporti-bot@users.noreply.github.com' }
const SHA_RE = /^[0-9a-f]{40}$/

const savedEnv = {}
let base
let origin
let repo
let marker

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
}

async function installHook(name) {
  const hooks = join(repo, 'evil-hooks')
  await mkdir(hooks, { recursive: true })
  await writeFile(join(hooks, name), `#!/bin/sh\ntouch "${marker}"\n`)
  await chmod(join(hooks, name), 0o755)
  git(repo, 'config', 'core.hooksPath', hooks)
}

beforeAll(() => {
  for (const [key, value] of Object.entries(ISOLATED_GIT_ENV)) {
    savedEnv[key] = process.env[key]
    process.env[key] = value
  }
})

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'soporti-git-'))
  origin = join(base, 'origin.git')
  repo = join(base, 'repo')
  marker = join(base, 'hook-ran')
  execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', origin])
  execFileSync('git', ['init', '--quiet', '--initial-branch=main', repo])
  await writeFile(join(repo, 'README.md'), '# App\n')
  await writeFile(join(repo, 'old.txt'), 'old\n')
  git(repo, 'add', '--all')
  git(repo, '-c', 'user.name=Seed', '-c', 'user.email=seed@example.com', 'commit', '--quiet', '-m', 'Seed')
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('readHead', () => {
  it('returns the full sha of the checked out commit', async () => {
    const head = await readHead(repo)

    expect(head).toMatch(SHA_RE)
    expect(head).toBe(git(repo, 'rev-parse', 'HEAD'))
  })
})

describe('hasUncommittedChanges', () => {
  it('is false for a clean worktree and true once a file is added or changed', async () => {
    expect(await hasUncommittedChanges(repo)).toBe(false)

    await writeFile(join(repo, 'new.txt'), 'new\n')

    expect(await hasUncommittedChanges(repo)).toBe(true)
  })
})

describe('commitAll', () => {
  it('commits every change with the given message and author', async () => {
    await writeFile(join(repo, 'README.md'), '# App\n\nMore.\n')
    await writeFile(join(repo, 'new.txt'), 'new\n')

    await commitAll(repo, { message: 'Explain the app', ...AUTHOR })

    expect(git(repo, 'log', '-1', '--format=%an|%ae|%cn|%ce|%s')).toBe(
      'Soporti Bot|42+soporti-bot@users.noreply.github.com|Soporti Bot|42+soporti-bot@users.noreply.github.com|Explain the app'
    )
    expect(git(repo, 'status', '--porcelain')).toBe('')
  })

  it('never runs a commit hook, even when one is configured', async () => {
    await installHook('pre-commit')
    await writeFile(join(repo, 'new.txt'), 'new\n')

    await commitAll(repo, { message: 'Add a file', ...AUTHOR })

    expect(existsSync(marker)).toBe(false)
    expect(git(repo, 'log', '-1', '--format=%s')).toBe('Add a file')
  })

  it('does not sign the commit even when signing is configured', async () => {
    git(repo, 'config', 'commit.gpgsign', 'true')
    await writeFile(join(repo, 'new.txt'), 'new\n')

    await commitAll(repo, { message: 'Add a file', ...AUTHOR })

    expect(git(repo, 'log', '-1', '--format=%s')).toBe('Add a file')
  })

  it('creates no commit when nothing changed', async () => {
    const before = git(repo, 'rev-parse', 'HEAD')

    await commitAll(repo, { message: 'Nothing', ...AUTHOR })

    expect(git(repo, 'rev-parse', 'HEAD')).toBe(before)
  })
})

describe('listChangedFiles', () => {
  it('lists added, modified and deleted files between a commit and HEAD', async () => {
    const from = git(repo, 'rev-parse', 'HEAD')
    await writeFile(join(repo, 'README.md'), '# Renamed app\n')
    await writeFile(join(repo, 'with space.txt'), 'hi\n')
    await rm(join(repo, 'old.txt'))
    await commitAll(repo, { message: 'Change files', ...AUTHOR })

    expect(await listChangedFiles(repo, from)).toEqual([
      { path: 'README.md', status: 'modified' },
      { path: 'old.txt', status: 'deleted' },
      { path: 'with space.txt', status: 'added' },
    ])
  })
})

describe('pushHead', () => {
  it('pushes HEAD to the named branch without running a push hook', async () => {
    await installHook('pre-push')

    await pushHead(repo, { url: origin, branch: 'soporti/explain-abc123' })

    expect(git(origin, 'rev-parse', 'refs/heads/soporti/explain-abc123')).toBe(git(repo, 'rev-parse', 'HEAD'))
    expect(existsSync(marker)).toBe(false)
  })

  it('fails with git output when the remote does not exist', async () => {
    const failure = await pushHead(repo, { url: join(base, 'missing.git'), branch: 'soporti/x-abc123' }).catch(
      err => err
    )

    expect(gitErrorDetail(failure)).toContain('does not appear to be a git repository')
  })
})

describe('gitErrorDetail', () => {
  it('prefers what git printed and falls back to the error message', () => {
    expect(gitErrorDetail(Object.assign(new Error('Command failed'), { stderr: 'fatal: nope\n' }))).toBe('fatal: nope')
    expect(gitErrorDetail(Object.assign(new Error('Command failed'), { stderr: '' }))).toBe('Command failed')
    expect(gitErrorDetail(new Error('spawn git ENOENT'))).toBe('spawn git ENOENT')
  })
})
