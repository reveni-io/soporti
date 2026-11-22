import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { BLOCKED_PATHS, sanitizePath } from '../github/sanitize.js'

const WORKFLOWS_DIR = '.github'
const BLOCKED_SEGMENTS = new Set(BLOCKED_PATHS.map(path => path.toLowerCase()))

export function parseWritablePath(path) {
  if (typeof path !== 'string') throw new Error('A file path is required.')

  const safePath = sanitizePath(path)
  if (!safePath) throw new Error('A file path is required.')

  const segments = safePath.split('/')
  if (segments.includes('')) throw new Error(`"${safePath}" is not a valid file path.`)

  if (segments.some(segment => segment.toLowerCase() === WORKFLOWS_DIR)) {
    throw new Error(
      `"${safePath}" is under .github/. Workflow and CI files are off-limits: Soporti never changes them.`
    )
  }

  const blocked = segments.find(segment => BLOCKED_SEGMENTS.has(segment.toLowerCase()))
  if (blocked) throw new Error(`Access to "${blocked}" is not allowed.`)

  return safePath
}

async function lstatOrNull(path) {
  try {
    return await lstat(path)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

function assertTraversable(stats, { prefix, safePath, isLast }) {
  if (stats.isSymbolicLink()) {
    throw new Error(
      `"${prefix}" is a symbolic link. Soporti never writes through links: use the real path of the file instead.`
    )
  }

  if (!isLast && !stats.isDirectory()) {
    throw new Error(`"${prefix}" is a file, so "${safePath}" can't be written inside it.`)
  }
}

async function findDeepestExisting(localPath, safePath) {
  const segments = safePath.split('/')
  let deepest = { path: localPath, stats: null, depth: 0 }

  for (const [index, segment] of segments.entries()) {
    const path = join(deepest.path, segment)
    const stats = await lstatOrNull(path)
    if (!stats) break

    const prefix = segments.slice(0, index + 1).join('/')
    assertTraversable(stats, { prefix, safePath, isLast: index === segments.length - 1 })
    deepest = { path, stats, depth: index + 1 }
  }

  return { ...deepest, exists: deepest.depth === segments.length }
}

async function assertInsideWorktree(localPath, path, safePath) {
  const [realRoot, realTarget] = await Promise.all([realpath(localPath), realpath(path)])
  const inside = relative(realRoot, realTarget)

  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error(`"${safePath}" points outside the repository.`)
  }
}

export async function resolveWritablePath(localPath, safePath) {
  const deepest = await findDeepestExisting(localPath, safePath)

  await assertInsideWorktree(localPath, deepest.path, safePath)

  return { target: join(localPath, safePath), stats: deepest.exists ? deepest.stats : null }
}
