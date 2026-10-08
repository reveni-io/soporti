import { describe, it, expect } from 'vitest'
import {
  commentableLines,
  partitionFindings,
  buildGeneratedMatcher,
  classifyFiles,
  findUnreviewedFiles,
} from './diff.js'

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

describe('buildGeneratedMatcher', () => {
  it('flags lockfiles at any depth', () => {
    const isGenerated = buildGeneratedMatcher()

    for (const filename of [
      'package-lock.json',
      'client/package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'api/poetry.lock',
      'Pipfile.lock',
      'Cargo.lock',
      'go.sum',
      'composer.lock',
      'Gemfile.lock',
    ]) {
      expect(isGenerated(filename)).toBe(true)
    }
  })

  it('flags minified bundles, source maps, snapshots and drizzle metadata', () => {
    const isGenerated = buildGeneratedMatcher()

    expect(isGenerated('public/vendor.min.js')).toBe(true)
    expect(isGenerated('public/site.min.css')).toBe(true)
    expect(isGenerated('dist/app.js.map')).toBe(true)
    expect(isGenerated('src/__snapshots__/Button.test.jsx.snap')).toBe(true)
    expect(isGenerated('__snapshots__/a.snap')).toBe(true)
    expect(isGenerated('server/drizzle/meta/0007_snapshot.json')).toBe(true)
  })

  it('leaves source files, migrations and look-alike names alone', () => {
    const isGenerated = buildGeneratedMatcher()

    expect(isGenerated('src/checkout.js')).toBe(false)
    expect(isGenerated('server/drizzle/0007_add_orders.sql')).toBe(false)
    expect(isGenerated('package.json')).toBe(false)
    expect(isGenerated('src/package-lock.json.js')).toBe(false)
    expect(isGenerated('src/minjs.js')).toBe(false)
    expect(isGenerated('docs/roadmap')).toBe(false)
  })

  it('adds the linguist-generated paths of .gitattributes', () => {
    const isGenerated = buildGeneratedMatcher(
      [
        '# generated code',
        '*.pb.go linguist-generated=true',
        '/api/schema.graphql linguist-generated',
        'src/gen/** linguist-generated',
        'docs/*.md linguist-documentation',
        '*.svg -linguist-generated',
        '',
      ].join('\n')
    )

    expect(isGenerated('proto/user.pb.go')).toBe(true)
    expect(isGenerated('api/schema.graphql')).toBe(true)
    expect(isGenerated('src/gen/client/index.ts')).toBe(true)
    expect(isGenerated('nested/api/schema.graphql')).toBe(false)
    expect(isGenerated('lib/src/gen/index.ts')).toBe(false)
    expect(isGenerated('docs/readme.md')).toBe(false)
    expect(isGenerated('logo.svg')).toBe(false)
  })

  it('treats regex characters in .gitattributes patterns literally', () => {
    const isGenerated = buildGeneratedMatcher('src/(gen)+.js linguist-generated')

    expect(isGenerated('src/(gen)+.js')).toBe(true)
    expect(isGenerated('src/gengen.js')).toBe(false)
  })
})

describe('classifyFiles', () => {
  it('marks each changed file as generated and empty or not, skipping entries without a name', () => {
    const files = [
      { filename: 'src/checkout.js', status: 'modified', patch: PATCH },
      { filename: 'package-lock.json', status: 'modified' },
      { filename: 'app/__init__.py', status: 'added' },
      { status: 'modified' },
      null,
    ]

    const classified = classifyFiles(files, {
      emptyFilenames: new Set(['app/__init__.py']),
      isGenerated: buildGeneratedMatcher(),
    })

    expect(classified).toEqual([
      { filename: 'src/checkout.js', status: 'modified', patch: PATCH, generated: false, empty: false },
      { filename: 'package-lock.json', status: 'modified', generated: true, empty: false },
      { filename: 'app/__init__.py', status: 'added', generated: false, empty: true },
    ])
  })

  it('returns an empty list when there are no files', () => {
    expect(classifyFiles(undefined, { emptyFilenames: new Set(), isGenerated: () => false })).toEqual([])
  })
})

describe('findUnreviewedFiles', () => {
  const files = [
    { filename: 'src/checkout.js', generated: false, empty: false },
    { filename: 'src/cart.js', generated: false, empty: false },
    { filename: 'package-lock.json', generated: true, empty: false },
    { filename: 'app/__init__.py', generated: false, empty: true },
  ]

  it('reports every source file whose diff the reviewer did not read', () => {
    expect(findUnreviewedFiles(files, new Set(['src/checkout.js']))).toEqual(['src/cart.js'])
  })

  it('never requires generated or verified-empty files', () => {
    expect(findUnreviewedFiles(files, new Set(['src/checkout.js', 'src/cart.js']))).toEqual([])
  })

  it('reports every source file when nothing was read', () => {
    expect(findUnreviewedFiles(files, new Set())).toEqual(['src/checkout.js', 'src/cart.js'])
  })
})
