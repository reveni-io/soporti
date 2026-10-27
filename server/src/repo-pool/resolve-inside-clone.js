import { realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { BLOCKED_PATHS } from '../github/sanitize.js'

export function withoutClonePath(text, localPath) {
  return String(text ?? '')
    .replaceAll(`${localPath}/`, '')
    .replaceAll(localPath, '')
}

export function toFsToolError(err, { localPath, messages = {} }) {
  return new Error(messages[err.code] ?? withoutClonePath(err.message, localPath), { cause: err })
}

function isOutside(relativePath) {
  return relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)
}

export async function resolveInsideClone(localPath, safePath) {
  const target = join(localPath, safePath)
  const missing = `"${safePath}" does not exist in this repository. Find it with search_code or find_files.`
  const [realRoot, realTarget] = await Promise.all([
    realpath(localPath),
    realpath(target).catch(err => {
      throw toFsToolError(err, { localPath, messages: { ENOENT: missing, ENOTDIR: missing } })
    }),
  ])
  const inside = relative(realRoot, realTarget)

  if (isOutside(inside)) {
    throw new Error(`"${safePath}" points outside the repository.`)
  }

  const blocked = inside.split(sep).find(segment => BLOCKED_PATHS.includes(segment))
  if (blocked) {
    throw new Error(`Access to "${blocked}" is not allowed.`)
  }

  return target
}
