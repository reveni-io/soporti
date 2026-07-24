import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { sanitizePath, parseRepo, BLOCKED_PATHS } from '../github/sanitize.js'
import { pool } from './pool.js'

const execFileAsync = promisify(execFile)

const MAX_SEARCH_RESULTS = 100
const MAX_FIND_RESULTS = 200
const DEFAULT_FILE_LINES = 2000
const MAX_FILE_LINES = 5000
const DEFAULT_LOG_LIMIT = 20
const MAX_LOG_LIMIT = 100
const MAX_BLAME_LINES = 500

const EXCLUDE_DIRS = ['.git', 'node_modules']

function excludeDirArgs() {
  return EXCLUDE_DIRS.map(d => `--exclude-dir=${d}`)
}

function excludeEnvArgs() {
  return BLOCKED_PATHS.filter(p => p.startsWith('.env')).map(p => `--exclude=${p}`)
}

async function withClone(repoFullName, fn) {
  parseRepo(repoFullName)
  const { localPath, release } = await pool.acquire(repoFullName)
  try {
    return await fn(localPath)
  } finally {
    release()
  }
}

export function getDirectoryContents(repoFullName, path = '') {
  return withClone(repoFullName, localPath => getDirectoryContentsAt(localPath, path))
}

export async function getDirectoryContentsAt(localPath, path = '') {
  const safePath = sanitizePath(path)

  const target = join(localPath, safePath)
  const entries = await readdir(target, { withFileTypes: true })
  const visible = entries.filter(e => !EXCLUDE_DIRS.includes(e.name))

  return Promise.all(
    visible.map(async e => {
      const entryPath = safePath ? `${safePath}/${e.name}` : e.name
      const isDir = e.isDirectory()
      let size = null
      if (!isDir) {
        try {
          const s = await stat(join(target, e.name))
          size = s.size
        } catch {
          size = null
        }
      }
      return {
        name: e.name,
        path: entryPath,
        type: isDir ? 'dir' : 'file',
        size,
      }
    })
  )
}

export function getFileContents(repoFullName, path, options = {}) {
  return withClone(repoFullName, localPath => getFileContentsAt(localPath, path, options))
}

export async function getFileContentsAt(localPath, path, { offset = 0, limit = DEFAULT_FILE_LINES } = {}) {
  const safePath = sanitizePath(path)
  if (!safePath) {
    throw new Error('A file path is required.')
  }

  const safeOffset = Math.max(0, Number.isFinite(offset) ? Math.floor(offset) : 0)
  const safeLimit = Math.min(
    MAX_FILE_LINES,
    Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_FILE_LINES)
  )

  const target = join(localPath, safePath)
  const raw = await readFile(target, 'utf-8')
  const allLines = raw.split('\n')
  const totalLines = allLines.length
  const slice = allLines.slice(safeOffset, safeOffset + safeLimit)
  const truncated = safeOffset + slice.length < totalLines

  return {
    path: safePath,
    content: slice.join('\n'),
    offset: safeOffset,
    lineCount: slice.length,
    totalLines,
    truncated,
    ...(truncated && {
      nextOffset: safeOffset + slice.length,
      hint: `File has ${totalLines} lines; ${slice.length} returned starting at line ${safeOffset + 1}. Call again with offset=${safeOffset + slice.length} to read more.`,
    }),
  }
}

export function searchCode(repoFullName, query, options = {}) {
  return withClone(repoFullName, localPath => searchCodeAt(localPath, query, options))
}

export async function searchCodeAt(
  localPath,
  query,
  { pathGlob = '', caseInsensitive = false, regex = false, maxResults = MAX_SEARCH_RESULTS } = {}
) {
  if (!query || query.trim().length === 0) {
    throw new Error('A search query is required.')
  }

  const safeQuery = query.trim().slice(0, 256)
  const cap = Math.min(
    MAX_SEARCH_RESULTS,
    Math.max(1, Number.isFinite(maxResults) ? Math.floor(maxResults) : MAX_SEARCH_RESULTS)
  )

  const args = ['-r', '-n', '-H', '-I', ...excludeDirArgs(), ...excludeEnvArgs()]
  if (caseInsensitive) args.push('-i')
  args.push(regex ? '-E' : '-F')
  if (pathGlob && typeof pathGlob === 'string') {
    args.push(`--include=${pathGlob.slice(0, 128)}`)
  }
  args.push('-e', safeQuery, localPath)

  let stdout
  try {
    const result = await execFileAsync('grep', args, { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 })
    stdout = result.stdout
  } catch (err) {
    if (err.code === 1) {
      return { totalCount: 0, items: [], truncated: false }
    }
    throw err
  }

  const lines = stdout.split('\n').filter(Boolean)
  const items = []
  const prefix = localPath + '/'
  for (const line of lines) {
    if (items.length >= cap) break
    const relPart = line.startsWith(prefix) ? line.slice(prefix.length) : line
    const firstColon = relPart.indexOf(':')
    if (firstColon === -1) continue
    const path = relPart.slice(0, firstColon)
    const rest = relPart.slice(firstColon + 1)
    const secondColon = rest.indexOf(':')
    if (secondColon === -1) continue
    const lineNumber = Number.parseInt(rest.slice(0, secondColon), 10)
    const snippet = rest
      .slice(secondColon + 1)
      .trim()
      .slice(0, 240)
    if (!Number.isFinite(lineNumber)) continue
    items.push({ path, line: lineNumber, snippet })
  }

  return {
    totalCount: lines.length,
    items,
    truncated: lines.length > items.length,
  }
}

export function findFiles(repoFullName, pattern, options = {}) {
  return withClone(repoFullName, localPath => findFilesAt(localPath, pattern, options))
}

export async function findFilesAt(localPath, pattern, { maxResults = MAX_FIND_RESULTS } = {}) {
  if (!pattern || pattern.trim().length === 0) {
    throw new Error('A pattern is required.')
  }

  const safePattern = pattern.trim().slice(0, 200)
  const cap = Math.min(
    MAX_FIND_RESULTS,
    Math.max(1, Number.isFinite(maxResults) ? Math.floor(maxResults) : MAX_FIND_RESULTS)
  )
  const usePathMatch = safePattern.includes('/')

  const args = [localPath, '-type', 'f']
  for (const dir of EXCLUDE_DIRS) {
    args.push('-not', '-path', `*/${dir}/*`)
  }
  for (const env of BLOCKED_PATHS.filter(p => p.startsWith('.env'))) {
    args.push('-not', '-name', env)
  }
  if (usePathMatch) {
    args.push('-path', `*${safePattern}*`)
  } else {
    args.push('-iname', safePattern)
  }

  let stdout
  try {
    const result = await execFileAsync('find', args, { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 })
    stdout = result.stdout
  } catch (err) {
    if (err.code === 1) {
      return { totalCount: 0, items: [], truncated: false }
    }
    throw err
  }

  const lines = stdout.split('\n').filter(Boolean)
  const prefix = localPath + '/'
  const items = lines
    .slice(0, cap)
    .map(line => (line.startsWith(prefix) ? line.slice(prefix.length) : line))
    .map(rel => ({ path: rel, name: rel.split('/').pop() }))

  return { totalCount: lines.length, items, truncated: lines.length > items.length }
}

export function gitLogFile(repoFullName, path, options = {}) {
  return withClone(repoFullName, localPath => gitLogFileAt(localPath, path, options))
}

export async function gitLogFileAt(localPath, path, { limit = DEFAULT_LOG_LIMIT } = {}) {
  const safePath = sanitizePath(path)
  if (!safePath) {
    throw new Error('A file path is required.')
  }

  const cap = Math.min(MAX_LOG_LIMIT, Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_LOG_LIMIT))

  const fmt = '%H%x09%an%x09%ae%x09%aI%x09%s'
  let stdout
  try {
    const result = await execFileAsync(
      'git',
      ['-C', localPath, 'log', `--max-count=${cap}`, `--pretty=format:${fmt}`, '--', safePath],
      { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }
    )
    stdout = result.stdout
  } catch (err) {
    throw new Error(`git log failed: ${err.message}`, { cause: err })
  }

  const commits = stdout
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [hash, author, email, date, ...subjectParts] = line.split('\t')
      return { hash, author, email, date, subject: subjectParts.join('\t') }
    })

  return { path: safePath, commits, count: commits.length }
}

export function gitBlame(repoFullName, path, options = {}) {
  return withClone(repoFullName, localPath => gitBlameAt(localPath, path, options))
}

export async function gitBlameAt(localPath, path, { startLine = 1, endLine = null } = {}) {
  const safePath = sanitizePath(path)
  if (!safePath) {
    throw new Error('A file path is required.')
  }

  const start = Math.max(1, Number.isFinite(startLine) ? Math.floor(startLine) : 1)
  let end = Number.isFinite(endLine) ? Math.floor(endLine) : start + MAX_BLAME_LINES - 1
  if (end < start) end = start
  if (end - start + 1 > MAX_BLAME_LINES) end = start + MAX_BLAME_LINES - 1

  let stdout
  try {
    const result = await execFileAsync(
      'git',
      ['-C', localPath, 'blame', '-L', `${start},${end}`, '--line-porcelain', '--', safePath],
      { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }
    )
    stdout = result.stdout
  } catch (err) {
    throw new Error(`git blame failed: ${err.message}`, { cause: err })
  }

  const lines = parsePorcelainBlame(stdout)
  return { path: safePath, startLine: start, endLine: end, lines }
}

function parsePorcelainBlame(stdout) {
  const out = []
  const rows = stdout.split('\n')
  let current = null
  for (const row of rows) {
    if (!current && /^[0-9a-f]{40} \d+ \d+/.test(row)) {
      const [hash, , finalLine] = row.split(' ')
      current = { hash, line: Number.parseInt(finalLine, 10) }
      continue
    }
    if (!current) continue
    if (row.startsWith('author ')) {
      current.author = row.slice(7)
    } else if (row.startsWith('author-time ')) {
      const ts = Number.parseInt(row.slice(12), 10)
      if (Number.isFinite(ts)) current.date = new Date(ts * 1000).toISOString()
    } else if (row.startsWith('summary ')) {
      current.summary = row.slice(8)
    } else if (row.startsWith('\t')) {
      current.content = row.slice(1)
      out.push(current)
      current = null
    }
  }
  return out
}
