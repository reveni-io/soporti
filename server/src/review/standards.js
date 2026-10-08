import path from 'node:path'
import { findFiles, findFilesAt, getFileContents, getFileContentsAt } from '../repo-pool/index.js'
import { MAX_FILE_LINES } from '../constants.js'

const SCOPED_PATTERNS = ['REVIEW.md', 'CLAUDE.md', 'AGENTS.md']
const SHARED_PATTERNS = [
  'CONTRIBUTING.md',
  'CONTEXT.md',
  'STYLE*.md',
  'STANDARDS.md',
  'docs/adr/*.md',
  '.claude/skills/*.md',
  '.agents/skills/*.md',
]
const STANDARDS_PATTERNS = [...SCOPED_PATTERNS, ...SHARED_PATTERNS]
const REVIEW_FILENAME = 'review.md'
const ROOT_DIRS = new Set(['.', '.claude'])
const ROOT_REVIEW_TIER = 0
const ROOT_SCOPED_TIER = 1
const NESTED_SCOPED_TIER = 2
const FIRST_SHARED_TIER = 3
const MAX_FOUND_PER_PATTERN = 20
const MAX_STANDARDS_FILES = 30
const MAX_STANDARDS_CHARS = 200_000
const MAX_STANDARDS_DOCUMENT_CHARS = 40_000

export async function loadStandards({ repoFullName, rootPath, files }, { logger = console } = {}) {
  const changedPaths = new Set(files.map(file => file.filename))
  const found = await discoverStandards(repoFullName, rootPath, logger)
  const ordered = orderStandards(found, changedDirectories(changedPaths)).slice(0, MAX_STANDARDS_FILES)

  const documents = await Promise.all(
    ordered.map(docPath => readStandard({ repoFullName, rootPath, docPath, changedPaths }, logger))
  )

  return fitStandards(documents)
}

async function discoverStandards(repoFullName, rootPath, logger) {
  const find = pattern =>
    rootPath
      ? findFilesAt(rootPath, pattern, { maxResults: MAX_FOUND_PER_PATTERN })
      : findFiles(repoFullName, pattern, { maxResults: MAX_FOUND_PER_PATTERN })
  const results = await Promise.allSettled(STANDARDS_PATTERNS.map(find))

  const failures = results.filter(r => r.status === 'rejected')
  if (failures.length > 0) {
    logger.warn(
      `[review] Standards discovery incomplete for ${repoFullName} (${failures[0].reason?.message ?? 'unknown error'})`
    )
  }

  return results.flatMap((result, patternIndex) => {
    if (result.status !== 'fulfilled') return []
    return result.value.items.map(item => ({ path: item.path, patternIndex }))
  })
}

function orderStandards(found, changedDirs) {
  const ranked = found
    .map(doc => ({ ...doc, tier: standardsTier(doc, changedDirs) }))
    .filter(doc => doc.tier !== null)
    .sort(compareStandards)

  return [...new Set(ranked.map(doc => doc.path))]
}

function standardsTier({ path: docPath, patternIndex }, changedDirs) {
  const dir = path.posix.dirname(docPath)

  if (patternIndex >= SCOPED_PATTERNS.length) return FIRST_SHARED_TIER + patternIndex - SCOPED_PATTERNS.length
  if (!ROOT_DIRS.has(dir)) return changedDirs.has(dir) ? NESTED_SCOPED_TIER : null
  if (path.posix.basename(docPath).toLowerCase() === REVIEW_FILENAME) return ROOT_REVIEW_TIER

  return ROOT_SCOPED_TIER
}

function compareStandards(a, b) {
  return (
    a.tier - b.tier || closeness(b) - closeness(a) || a.patternIndex - b.patternIndex || a.path.localeCompare(b.path)
  )
}

function closeness(doc) {
  if (doc.tier !== NESTED_SCOPED_TIER) return 0

  return doc.path.split('/').length
}

function changedDirectories(changedPaths) {
  const dirs = new Set()

  for (const changedPath of changedPaths) {
    const segments = changedPath.split('/')
    for (let depth = 1; depth < segments.length; depth++) dirs.add(segments.slice(0, depth).join('/'))
  }

  return dirs
}

async function readStandard({ repoFullName, rootPath, docPath, changedPaths }, logger) {
  const modified = changedPaths.has(docPath)

  try {
    const page = rootPath
      ? await getFileContentsAt(rootPath, docPath, { limit: MAX_FILE_LINES })
      : await getFileContents(repoFullName, docPath, { limit: MAX_FILE_LINES })

    return {
      path: docPath,
      modified,
      content: page.content.slice(0, MAX_STANDARDS_DOCUMENT_CHARS),
      truncated: page.truncated || page.content.length > MAX_STANDARDS_DOCUMENT_CHARS,
    }
  } catch (err) {
    logger.warn(`[review] Could not read the standards document ${docPath} of ${repoFullName} (${err.message})`)
    return { path: docPath, modified, content: null, truncated: false }
  }
}

function fitStandards(documents) {
  const inlined = []
  const notInlined = []
  let remaining = MAX_STANDARDS_CHARS

  for (const document of documents) {
    if (document.content === null || document.content.length > remaining) {
      notInlined.push({ path: document.path, modified: document.modified })
      continue
    }

    inlined.push(document)
    remaining -= document.content.length
  }

  return { documents: inlined, notInlined }
}
