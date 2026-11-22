import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseWritablePath, resolveWritablePath } from './write-path.js'

let base
let worktree

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'soporti-write-path-'))
  worktree = join(base, 'worktree')
  await mkdir(join(worktree, 'src'), { recursive: true })
  await mkdir(join(base, 'outside'))
  await writeFile(join(worktree, 'src', 'a.js'), 'const a = 1\n')
  await writeFile(join(base, 'outside', 'secret.txt'), 'secret\n')
  await symlink(join(worktree, 'src', 'a.js'), join(worktree, 'inside-link.js'))
  await symlink(join(worktree, 'src'), join(worktree, 'src-link'))
  await symlink(join(base, 'outside'), join(worktree, 'outside-link'))
  await symlink(join(base, 'outside', 'missing.txt'), join(worktree, 'dangling-link'))
})

afterAll(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('parseWritablePath', () => {
  it('returns the cleaned relative path', () => {
    expect(parseWritablePath('/src/a.js')).toBe('src/a.js')
  })

  it.each([
    { kind: 'a workflow file', path: '.github/workflows/ci.yml', message: 'Workflow and CI files are off-limits' },
    { kind: 'a workflow file in other casing', path: '.GitHub/workflows/ci.yml', message: 'is under .github/' },
    { kind: 'a nested .github folder', path: 'packages/api/.github/CODEOWNERS', message: 'is under .github/' },
    { kind: 'the git folder', path: '.git/config', message: 'Access to ".git" is not allowed' },
    { kind: 'the git folder in other casing', path: '.GIT/config', message: 'Access to ".GIT" is not allowed' },
    { kind: 'an env file', path: 'server/.env', message: 'Access to ".env" is not allowed' },
    { kind: 'node_modules', path: 'node_modules/x/index.js', message: 'Access to "node_modules" is not allowed' },
    { kind: 'a parent traversal', path: 'src/../../etc/passwd', message: 'Path traversal is not allowed' },
    { kind: 'an encoded traversal', path: 'src/%2e%2e/x', message: 'Path traversal is not allowed' },
    { kind: 'an empty path', path: '', message: 'A file path is required' },
    { kind: 'the repository root', path: '/', message: 'A file path is required' },
    { kind: 'a folder path', path: 'src/', message: '"src/" is not a valid file path' },
    { kind: 'a non-string path', path: 42, message: 'A file path is required' },
  ])('refuses $kind', ({ path, message }) => {
    expect(() => parseWritablePath(path)).toThrow(message)
  })
})

describe('resolveWritablePath', () => {
  it('returns the target and its stats for an existing file', async () => {
    const { target, stats } = await resolveWritablePath(worktree, 'src/a.js')

    expect(target).toBe(join(worktree, 'src/a.js'))
    expect(stats.isFile()).toBe(true)
  })

  it('returns null stats for a new file in new folders', async () => {
    const { target, stats } = await resolveWritablePath(worktree, 'src/deep/new/b.js')

    expect(target).toBe(join(worktree, 'src/deep/new/b.js'))
    expect(stats).toBeNull()
  })

  it('returns the stats of an existing folder so callers can refuse it', async () => {
    const { stats } = await resolveWritablePath(worktree, 'src')

    expect(stats.isDirectory()).toBe(true)
  })

  it.each([
    {
      kind: 'a link to a file inside the repository',
      path: 'inside-link.js',
      message: '"inside-link.js" is a symbolic link',
    },
    {
      kind: 'a new file under a link to a folder inside',
      path: 'src-link/new.js',
      message: '"src-link" is a symbolic link',
    },
    {
      kind: 'a file under a link out of the repository',
      path: 'outside-link/secret.txt',
      message: '"outside-link" is a symbolic link',
    },
    { kind: 'a dangling link', path: 'dangling-link', message: '"dangling-link" is a symbolic link' },
    {
      kind: 'a path under a file',
      path: 'src/a.js/b.js',
      message: '"src/a.js" is a file, so "src/a.js/b.js" can\'t be written inside it',
    },
  ])('refuses $kind without leaking the worktree path', async ({ path, message }) => {
    const failure = await resolveWritablePath(worktree, path).catch(err => err)

    expect(failure.message).toContain(message)
    expect(failure.message).not.toContain(base)
  })

  it('accepts a worktree that sits behind a symlink', async () => {
    const linkedRoot = join(base, 'linked-worktree')
    await symlink(worktree, linkedRoot)

    const { target, stats } = await resolveWritablePath(linkedRoot, 'src/a.js')

    expect(target).toBe(join(linkedRoot, 'src/a.js'))
    expect(stats.isFile()).toBe(true)
  })

  it('refuses a path that escapes the worktree even when it skipped parsing', async () => {
    const failure = await resolveWritablePath(worktree, '../outside/secret.txt').catch(err => err)

    expect(failure.message).toBe('"../outside/secret.txt" points outside the repository.')
  })
})
