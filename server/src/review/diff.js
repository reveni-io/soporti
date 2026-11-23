const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/
const TRAILING_NEWLINE = /\n$/
const GENERATED_PATTERNS = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'poetry.lock',
  'Pipfile.lock',
  'Cargo.lock',
  'go.sum',
  'composer.lock',
  'Gemfile.lock',
  '*.min.js',
  '*.min.css',
  '*.map',
  '**/__snapshots__/**',
  'drizzle/meta/**',
]
const GLOB_TOKEN = /(\*\*\/|\*\*|\*|\?)/
const GLOB_TOKEN_SOURCES = new Map([
  ['**/', '(?:.*/)?'],
  ['**', '.*'],
  ['*', '[^/]*'],
  ['?', '[^/]'],
])
const REGEX_SPECIAL = /[.+^${}()|[\]\\]/g
const WHITESPACE = /\s+/
const LEADING_SLASH = /^\//
const LINGUIST_GENERATED = /^linguist-generated(=true)?$/
const DEFAULT_GENERATED_MATCHERS = GENERATED_PATTERNS.map(pattern => globToRegExp(pattern, { isAnchored: false }))

export function commentableRanges(files) {
  const result = new Map()

  for (const file of files ?? []) {
    if (!file?.filename || typeof file.patch !== 'string') continue

    const ranges = hunkRanges(file.patch)
    if (ranges.length > 0) result.set(file.filename, ranges)
  }

  return result
}

export function renderNumberedPatch(patch) {
  const rows = numberPatchLines(patch)
  const width = String(rows.reduce((max, row) => Math.max(max, row.line ?? 0), 0)).length

  return rows.map(row => (row.isHunk ? row.text : `${String(row.line ?? '').padStart(width)} ${row.text}`)).join('\n')
}

function numberPatchLines(patch) {
  const rows = []
  let rightLine = null

  for (const text of patch.replace(TRAILING_NEWLINE, '').split('\n')) {
    const hunk = text.match(HUNK_HEADER)
    if (hunk) {
      rightLine = parseInt(hunk[1], 10)
      rows.push({ text, line: null, isHunk: true })
      continue
    }

    const isRightSide = rightLine !== null && (text.startsWith('+') || text.startsWith(' ') || text === '')
    rows.push({ text, line: isRightSide ? rightLine++ : null, isHunk: false })
  }

  return rows
}

export function partitionFindings(findings, files) {
  const ranges = commentableRanges(files)
  const anchored = []
  const unanchored = []

  for (const finding of findings) {
    const hunk = findHunk(ranges.get(finding.path), finding.line)
    if (!hunk) {
      unanchored.push(finding)
      continue
    }

    anchored.push({ ...finding, anchorStartLine: resolveAnchorStartLine(finding, hunk) })
  }

  return { anchored, unanchored }
}

export function buildGeneratedMatcher(gitattributes = '') {
  const matchers = [...DEFAULT_GENERATED_MATCHERS, ...parseLinguistGenerated(gitattributes)]

  return filename => matchers.some(matcher => matcher.test(filename))
}

export function classifyFiles(files, { emptyFilenames, isGenerated }) {
  return (files ?? [])
    .filter(file => file?.filename)
    .map(file => ({ ...file, generated: isGenerated(file.filename), empty: emptyFilenames.has(file.filename) }))
}

export function findUnreviewedFiles(files, reviewedPaths) {
  return files
    .filter(file => !file.generated && !file.empty && !reviewedPaths.has(file.filename))
    .map(file => file.filename)
}

function hunkRanges(patch) {
  const hunks = []

  for (const row of numberPatchLines(patch)) {
    if (row.isHunk) hunks.push([])
    if (row.line !== null) hunks.at(-1).push(row.line)
  }

  return hunks.filter(lines => lines.length > 0).map(lines => ({ start: lines[0], end: lines.at(-1) }))
}

function findHunk(hunks, line) {
  if (!Number.isInteger(line)) return null

  return hunks?.find(hunk => line >= hunk.start && line <= hunk.end) ?? null
}

function resolveAnchorStartLine({ startLine, line }, hunk) {
  if (!Number.isInteger(startLine) || startLine >= line) return null

  return startLine >= hunk.start ? startLine : null
}

function parseLinguistGenerated(gitattributes) {
  return gitattributes
    .split('\n')
    .map(line => line.trim().split(WHITESPACE))
    .filter(([pattern, ...attributes]) => isGeneratedRule(pattern, attributes))
    .map(([pattern]) => globToRegExp(pattern.replace(LEADING_SLASH, ''), { isAnchored: pattern.includes('/') }))
}

function isGeneratedRule(pattern, attributes) {
  if (!pattern || pattern.startsWith('#')) return false

  return attributes.some(attribute => LINGUIST_GENERATED.test(attribute))
}

function globToRegExp(glob, { isAnchored }) {
  const source = glob
    .split(GLOB_TOKEN)
    .map(token => GLOB_TOKEN_SOURCES.get(token) ?? token.replace(REGEX_SPECIAL, '\\$&'))
    .join('')

  return new RegExp(`${isAnchored ? '^' : '(?:^|/)'}${source}$`)
}
