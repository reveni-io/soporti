import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveInsideClone } from './resolve-inside-clone.js'

let base
let clone

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'soporti-clone-'))
  clone = join(base, 'clone')
  await mkdir(join(clone, 'src'), { recursive: true })
  await mkdir(join(clone, '.git'), { recursive: true })
  await mkdir(join(base, 'outside'))
  await writeFile(join(clone, 'src', 'a.js'), 'const a = 1\n')
  await writeFile(join(clone, '.git', 'config'), '[remote] url = https://x-access-token:secret@github.com/o/r\n')
  await writeFile(join(base, 'outside', 'secret.txt'), 'secret\n')
  await symlink(join(clone, 'src', 'a.js'), join(clone, 'inside-link.js'))
  await symlink(join(base, 'outside'), join(clone, 'outside-link'))
  await symlink(join(clone, '.git', 'config'), join(clone, 'config-link'))
  await symlink(clone, join(base, 'clone-link'))
  await symlink(base, join(clone, 'up'))
  await symlink(join(clone, 'loop'), join(clone, 'loop'))
})

afterAll(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('resolveInsideClone', () => {
  it.each([
    { kind: 'a file', path: 'src/a.js' },
    { kind: 'a link to a file in the repository', path: 'inside-link.js' },
    { kind: 'the repository root', path: '' },
  ])('allows $kind and returns its path under the clone', async ({ path }) => {
    expect(await resolveInsideClone(clone, path)).toBe(join(clone, path))
  })

  it('keeps the clone path as given when the clone sits behind a symlink', async () => {
    const linked = join(base, 'clone-link')

    expect(await resolveInsideClone(linked, 'src/a.js')).toBe(join(linked, 'src/a.js'))
  })

  it.each([
    {
      kind: 'a link out of the repository',
      path: 'outside-link',
      message: '"outside-link" points outside the repository',
    },
    {
      kind: 'a file reached through a link out of the repository',
      path: 'outside-link/secret.txt',
      message: 'points outside the repository',
    },
    { kind: 'a link to the directory holding the clone', path: 'up', message: '"up" points outside the repository' },
    { kind: 'a link to the git config', path: 'config-link', message: 'Access to ".git" is not allowed' },
    { kind: 'a link that loops', path: 'loop', message: 'ELOOP' },
    { kind: 'a missing path', path: 'src/missing.js', message: '"src/missing.js" does not exist in this repository' },
    { kind: 'a path under a file', path: 'src/a.js/x', message: '"src/a.js/x" does not exist in this repository' },
  ])('refuses $kind', async ({ path, message }) => {
    const failure = await resolveInsideClone(clone, path).catch(err => err)

    expect(failure.message).toContain(message)
    expect(failure.message).not.toContain(base)
  })
})
