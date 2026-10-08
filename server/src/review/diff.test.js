import { describe, it, expect } from 'vitest'
import {
  commentableRanges,
  partitionFindings,
  buildGeneratedMatcher,
  classifyFiles,
  findUnreviewedFiles,
  renderNumberedPatch,
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

const MULTI_HUNK_PATCH = [
  '@@ -1,2 +1,2 @@',
  ' line one',
  '-old two',
  '+new two',
  '@@ -10,2 +20,3 @@',
  ' ctx',
  '+added',
  ' ctx2',
].join('\n')

describe('commentableRanges', () => {
  it('maps each hunk to the RIGHT-side line range it covers', () => {
    expect(commentableRanges(FILES).get('src/checkout.js')).toEqual([{ start: 10, end: 13 }])
  })

  it('keeps one range per hunk', () => {
    const ranges = commentableRanges([{ filename: 'a.js', patch: MULTI_HUNK_PATCH }])

    expect(ranges.get('a.js')).toEqual([
      { start: 1, end: 2 },
      { start: 20, end: 22 },
    ])
  })

  it('skips files without a patch (binary or too large)', () => {
    expect(commentableRanges(FILES).has('assets/logo.png')).toBe(false)
  })

  it('skips a hunk with no RIGHT-side lines, like a deleted file', () => {
    const deleted = ['@@ -1,2 +0,0 @@', '-gone', '-also gone'].join('\n')

    expect(commentableRanges([{ filename: 'old.js', patch: deleted }]).has('old.js')).toBe(false)
  })

  it('returns an empty map for empty input', () => {
    expect(commentableRanges([]).size).toBe(0)
    expect(commentableRanges(undefined).size).toBe(0)
  })
})

describe('renderNumberedPatch', () => {
  it('prefixes every line with its RIGHT-side number and leaves removed lines unnumbered', () => {
    const patch = [
      '@@ -8,4 +10,5 @@ function checkout() {',
      '   const cart = getCart()',
      '-  const total = sum(cart)',
      '+  const total = sumItems(cart)',
      '+  validate(total)',
      '   return total',
    ].join('\n')

    expect(renderNumberedPatch(patch)).toBe(
      [
        '@@ -8,4 +10,5 @@ function checkout() {',
        '10    const cart = getCart()',
        '   -  const total = sum(cart)',
        '11 +  const total = sumItems(cart)',
        '12 +  validate(total)',
        '13    return total',
      ].join('\n')
    )
  })

  it('restarts the numbering at every hunk and pads the column to the widest number', () => {
    const patch = ['@@ -1,2 +1,2 @@', ' one', '-two', '+2', '@@ -98,2 +98,3 @@', ' ctx', '+added', ' ctx2'].join('\n')

    expect(renderNumberedPatch(patch)).toBe(
      [
        '@@ -1,2 +1,2 @@',
        '  1  one',
        '    -two',
        '  2 +2',
        '@@ -98,2 +98,3 @@',
        ' 98  ctx',
        ' 99 +added',
        '100  ctx2',
      ].join('\n')
    )
  })

  it('leaves the headers of a local git diff and the no-newline marker unnumbered and drops its trailing newline', () => {
    const patch = [
      'diff --git a/db/seed.sql b/db/seed.sql',
      '--- a/db/seed.sql',
      '+++ b/db/seed.sql',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '\\ No newline at end of file',
      '',
    ].join('\n')

    expect(renderNumberedPatch(patch)).toBe(
      [
        '  diff --git a/db/seed.sql b/db/seed.sql',
        '  --- a/db/seed.sql',
        '  +++ b/db/seed.sql',
        '@@ -1 +1 @@',
        '  -old',
        '1 +new',
        '  \\ No newline at end of file',
      ].join('\n')
    )
  })

  it('prints exactly the line numbers an inline comment can anchor on', () => {
    const printed = renderNumberedPatch(PATCH)
      .split('\n')
      .map(line => parseInt(line, 10))
      .filter(Number.isInteger)
    const findings = printed.map(line => ({ path: 'src/checkout.js', line, severity: 'minor', body: 'x' }))

    const { anchored, unanchored } = partitionFindings(findings, FILES)

    expect(printed).toEqual([10, 11, 12, 13])
    expect(anchored).toEqual(findings.map(finding => ({ ...finding, anchorStartLine: null })))
    expect(unanchored).toEqual([])
  })
})

describe('partitionFindings', () => {
  it('separates findings on diff lines from the rest', () => {
    const findings = [
      { path: 'src/checkout.js', line: 11, severity: 'major', body: 'sumItems can throw' },
      { path: 'src/checkout.js', line: 500, severity: 'minor', body: 'outside the diff' },
      { path: 'src/other.js', line: 11, severity: 'minor', body: 'file not in PR' },
      { path: 'src/checkout.js', line: null, severity: 'minor', body: 'no line at all' },
    ]

    const { anchored, unanchored } = partitionFindings(findings, FILES)

    expect(anchored).toEqual([{ ...findings[0], anchorStartLine: null }])
    expect(unanchored).toEqual([findings[1], findings[2], findings[3]])
  })

  it('anchors a multi-line range whose start and end share a hunk', () => {
    const findings = [{ path: 'src/checkout.js', startLine: 10, line: 12, severity: 'major', body: 'range' }]

    const { anchored } = partitionFindings(findings, FILES)

    expect(anchored).toEqual([{ ...findings[0], anchorStartLine: 10 }])
  })

  it('falls back to a single line when the range starts in another hunk or outside the diff', () => {
    const files = [{ filename: 'a.js', patch: MULTI_HUNK_PATCH }]
    const findings = [
      { path: 'a.js', startLine: 2, line: 21, severity: 'minor', body: 'spans two hunks' },
      { path: 'a.js', startLine: 15, line: 21, severity: 'minor', body: 'starts before the hunk' },
    ]

    const { anchored, unanchored } = partitionFindings(findings, files)

    expect(anchored.map(finding => [finding.line, finding.anchorStartLine])).toEqual([
      [21, null],
      [21, null],
    ])
    expect(unanchored).toEqual([])
  })

  it('treats a start line equal to or after the end line as a single line', () => {
    const findings = [
      { path: 'src/checkout.js', startLine: 12, line: 12, severity: 'minor', body: 'same line' },
      { path: 'src/checkout.js', startLine: 13, line: 11, severity: 'minor', body: 'reversed' },
    ]

    const { anchored } = partitionFindings(findings, FILES)

    expect(anchored.map(finding => finding.anchorStartLine)).toEqual([null, null])
  })

  it('does not mutate its inputs', () => {
    const findings = [{ path: 'src/checkout.js', startLine: 10, line: 11, severity: 'minor', body: 'ok' }]
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
