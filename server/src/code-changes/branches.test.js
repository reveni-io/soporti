import { describe, it, expect } from 'vitest'
import { assertPushableBranch, buildBranchName, isSoportiBranch } from './branches.js'

const SUFFIX_RE = /-[a-z0-9]{6}$/

describe('buildBranchName', () => {
  it.each([
    { title: 'Fix the greeting', slug: 'fix-the-greeting' },
    { title: '  Fix:   the -- greeting!  ', slug: 'fix-the-greeting' },
    { title: 'Arreglar el botón de añadir', slug: 'arreglar-el-boton-de-anadir' },
    {
      title: 'Handle the 404 on /api/orders when the order was deleted',
      slug: 'handle-the-404-on-api-orders-when-the-or',
    },
    { title: '🚀✨', slug: 'change' },
  ])('turns "$title" into soporti/$slug-<suffix>', ({ title, slug }) => {
    const branch = buildBranchName(title)

    expect(branch).toMatch(SUFFIX_RE)
    expect(branch.replace(SUFFIX_RE, '')).toBe(`soporti/${slug}`)
  })

  it('cuts the slug at 40 characters and drops the dash it ends on', () => {
    const branch = buildBranchName('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa b')

    expect(branch.replace(SUFFIX_RE, '')).toBe('soporti/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  })

  it('gives the same title a different branch every time', () => {
    const branches = new Set(Array.from({ length: 20 }, () => buildBranchName('Fix the greeting')))

    expect(branches.size).toBe(20)
  })
})

describe('isSoportiBranch', () => {
  it.each([
    { branch: 'soporti/fix-abc123', expected: true },
    { branch: 'soporti/', expected: false },
    { branch: 'main', expected: false },
    { branch: 'feature/soporti/x', expected: false },
    { branch: undefined, expected: false },
  ])('is $expected for $branch', ({ branch, expected }) => {
    expect(isSoportiBranch(branch)).toBe(expected)
  })
})

describe('assertPushableBranch', () => {
  it('accepts a soporti branch that is not the default branch', () => {
    expect(() => assertPushableBranch('soporti/fix-abc123', 'main')).not.toThrow()
  })

  it.each([
    { kind: 'the default branch', branch: 'main', baseBranch: 'main' },
    { kind: 'another team branch', branch: 'release', baseBranch: 'main' },
    { kind: 'a default branch that looks like a soporti branch', branch: 'soporti/main', baseBranch: 'soporti/main' },
  ])('refuses $kind', ({ branch, baseBranch }) => {
    expect(() => assertPushableBranch(branch, baseBranch)).toThrow(
      `Refusing to push to "${branch}": Soporti only pushes to its own soporti/ branches, never to the default branch.`
    )
  })
})
