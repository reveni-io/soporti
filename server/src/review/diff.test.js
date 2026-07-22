import { describe, it, expect } from 'vitest'
import { commentableLines, partitionFindings, selectFilesWithinBudget } from './diff.js'

// Patch fixture: one hunk starting at new line 10 with context, additions and a deletion.
const PATCH = [
  '@@ -8,4 +10,5 @@ function checkout() {',
  ' const cart = getCart()',
  '-const total = sum(cart)',
  '+const total = sumItems(cart)',
  '+validate(total)',
  ' return total',
].join('\n')

const FILES = [
  { filename: 'src/checkout.js', patch: PATCH, additions: 2, deletions: 1 },
  { filename: 'assets/logo.png', patch: undefined, additions: 0, deletions: 0 },
]

describe('commentableLines', () => {
  it('maps context and added lines to RIGHT-side line numbers', () => {
    const lines = commentableLines(FILES)
    // new lines: 10 (context), 11 (+), 12 (+), 13 (context)
    expect([...lines.get('src/checkout.js')].sort((a, b) => a - b)).toEqual([10, 11, 12, 13])
  })

  it('skips files without a patch (binary or too large)', () => {
    expect(commentableLines(FILES).has('assets/logo.png')).toBe(false)
  })

  it('handles multiple hunks in one file', () => {
    const multi = [
      '@@ -1,2 +1,2 @@',
      ' line one',
      '-old two',
      '+new two',
      '@@ -10,2 +20,3 @@',
      ' ctx',
      '+added',
      ' ctx2',
    ].join('\n')
    const lines = commentableLines([{ filename: 'a.js', patch: multi }])
    expect([...lines.get('a.js')].sort((a, b) => a - b)).toEqual([1, 2, 20, 21, 22])
  })

  it('returns an empty map for empty input', () => {
    expect(commentableLines([]).size).toBe(0)
    expect(commentableLines(undefined).size).toBe(0)
  })
})

describe('partitionFindings', () => {
  it('separates findings on diff lines from the rest', () => {
    const findings = [
      { path: 'src/checkout.js', line: 11, severity: 'high', body: 'sumItems can throw' },
      { path: 'src/checkout.js', line: 500, severity: 'low', body: 'outside the diff' },
      { path: 'src/other.js', line: 11, severity: 'low', body: 'file not in PR' },
      { path: 'src/checkout.js', line: null, severity: 'low', body: 'no line at all' },
    ]

    const { anchored, unanchored } = partitionFindings(findings, FILES)
    expect(anchored).toEqual([findings[0]])
    expect(unanchored).toEqual([findings[1], findings[2], findings[3]])
  })

  it('does not mutate its inputs', () => {
    const findings = [{ path: 'src/checkout.js', line: 10, severity: 'low', body: 'ok' }]
    const copy = structuredClone(findings)
    partitionFindings(findings, FILES)
    expect(findings).toEqual(copy)
  })
})

describe('selectFilesWithinBudget', () => {
  it('includes files until the changed-line budget is exhausted', () => {
    const files = [
      { filename: 'a.js', patch: 'x', additions: 30, deletions: 0 },
      { filename: 'b.js', patch: 'x', additions: 50, deletions: 10 },
      { filename: 'c.js', patch: 'x', additions: 40, deletions: 0 },
    ]
    const { included, omitted, usedLines } = selectFilesWithinBudget(files, 100)
    expect(included.map(f => f.filename)).toEqual(['a.js', 'b.js'])
    expect(omitted).toEqual([{ filename: 'c.js', reason: 'budget' }])
    expect(usedLines).toBe(90)
  })

  it('always includes at least the first patchable file even over budget', () => {
    const files = [{ filename: 'big.js', patch: 'x', additions: 5000, deletions: 0 }]
    const { included, omitted } = selectFilesWithinBudget(files, 100)
    expect(included.map(f => f.filename)).toEqual(['big.js'])
    expect(omitted).toEqual([])
  })

  it('reports files without a patch as omitted', () => {
    const { included, omitted, empty } = selectFilesWithinBudget(FILES, 1000)
    expect(included.map(f => f.filename)).toEqual(['src/checkout.js'])
    expect(omitted).toEqual([{ filename: 'assets/logo.png', reason: 'no-patch' }])
    expect(empty).toEqual([])
  })

  it('routes verified-empty patch-less files to the empty bucket instead of omitting them', () => {
    const files = [
      { filename: 'src/checkout.js', patch: PATCH, additions: 2, deletions: 1 },
      { filename: 'apps/coverage/__init__.py', additions: 0, deletions: 0, status: 'added' },
      // Binary: same 0/0 no-patch shape, but NOT verified empty — stays omitted.
      { filename: 'assets/logo.png', additions: 0, deletions: 0, status: 'added' },
    ]
    const { included, omitted, empty } = selectFilesWithinBudget(files, 1000, {
      emptyFilenames: new Set(['apps/coverage/__init__.py']),
    })
    expect(included.map(f => f.filename)).toEqual(['src/checkout.js'])
    expect(empty).toEqual([{ filename: 'apps/coverage/__init__.py', status: 'added' }])
    expect(omitted).toEqual([{ filename: 'assets/logo.png', reason: 'no-patch' }])
  })

  it('never treats a file with changed lines as empty, even when listed as verified empty', () => {
    const files = [{ filename: 'huge.sql', additions: 900, deletions: 400 }]
    const { omitted, empty } = selectFilesWithinBudget(files, 1000, {
      emptyFilenames: new Set(['huge.sql']),
    })
    expect(empty).toEqual([])
    expect(omitted).toEqual([{ filename: 'huge.sql', reason: 'no-patch' }])
  })

  it('keeps the budget strict after the first patchable file, even when earlier files had no patch', () => {
    const files = [
      { filename: 'binary.png', additions: 0, deletions: 0 },
      { filename: 'huge.js', patch: 'x', additions: 5000, deletions: 0 },
      { filename: 'small.js', patch: 'x', additions: 10, deletions: 0 },
    ]
    const { included, omitted } = selectFilesWithinBudget(files, 100)
    // huge.js is the first patchable file: always reviewed (deliberate exception);
    // everything after it stays under strict budget rules.
    expect(included.map(f => f.filename)).toEqual(['huge.js'])
    expect(omitted).toEqual([
      { filename: 'binary.png', reason: 'no-patch' },
      { filename: 'small.js', reason: 'budget' },
    ])
  })
})
