import { constants } from 'node:fs'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { resolveWritablePath } from './write-path.js'

const PREVIEW_CONTEXT_LINES = 3
const MAX_PREVIEW_LINES = 30
const WRITE_WITHOUT_FOLLOWING_LINKS = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW

export function parseEdit({ oldText, newText, replaceAll = false } = {}) {
  if (typeof oldText !== 'string' || oldText.length === 0) {
    throw new Error('oldText must be the exact, non-empty text to replace.')
  }
  if (typeof newText !== 'string') {
    throw new Error('newText must be a string. Use an empty string to remove oldText.')
  }
  if (oldText === newText) {
    throw new Error('oldText and newText are identical, so there is nothing to change.')
  }

  return { oldText, newText, replaceAll: replaceAll === true }
}

export function parseContent(content) {
  if (typeof content !== 'string') throw new Error('content must be the full text of the file.')

  return content
}

async function resolveExistingFile(localPath, safePath) {
  const { target, stats } = await resolveWritablePath(localPath, safePath)

  if (!stats) {
    throw new Error(`"${safePath}" does not exist in this repository. Find it with search_code or find_files.`)
  }
  if (!stats.isFile()) throw new Error(`"${safePath}" is not a regular file.`)

  return target
}

function writeContent(target, content) {
  return writeFile(target, content, { flag: WRITE_WITHOUT_FOLLOWING_LINKS })
}

function countOccurrences(content, text) {
  return content.split(text).length - 1
}

function previewAround(content, index, newText) {
  const lines = content.split('\n')
  const firstLine = content.slice(0, index).split('\n').length - 1
  const lastLine = firstLine + newText.split('\n').length - 1
  const start = Math.max(0, firstLine - PREVIEW_CONTEXT_LINES)
  const end = Math.min(lines.length, lastLine + PREVIEW_CONTEXT_LINES + 1, start + MAX_PREVIEW_LINES)

  return lines
    .slice(start, end)
    .map((line, offset) => `${start + offset + 1}\t${line}`)
    .join('\n')
}

export async function editFileAt(localPath, safePath, { oldText, newText, replaceAll }) {
  const target = await resolveExistingFile(localPath, safePath)
  const content = await readFile(target, 'utf8')

  if (content.includes('\0')) throw new Error(`"${safePath}" looks like a binary file and can't be edited as text.`)

  const first = content.indexOf(oldText)
  if (first === -1) {
    throw new Error(
      `oldText was not found in "${safePath}". Re-read the file and copy the exact text, whitespace included.`
    )
  }

  const count = countOccurrences(content, oldText)
  if (count > 1 && !replaceAll) {
    throw new Error(
      `oldText appears ${count} times in "${safePath}". Include more surrounding lines to make it unique, or set replaceAll to replace every occurrence.`
    )
  }

  const updated = replaceAll
    ? content.split(oldText).join(newText)
    : content.slice(0, first) + newText + content.slice(first + oldText.length)
  await writeContent(target, updated)

  return { path: safePath, replacements: replaceAll ? count : 1, preview: previewAround(updated, first, newText) }
}

export async function writeFileAt(localPath, safePath, content) {
  const { target, stats } = await resolveWritablePath(localPath, safePath)

  if (stats && !stats.isFile()) throw new Error(`"${safePath}" is not a regular file.`)

  await mkdir(dirname(target), { recursive: true })
  await writeContent(target, content)

  return { path: safePath, created: !stats }
}

export async function deleteFileAt(localPath, safePath) {
  const target = await resolveExistingFile(localPath, safePath)

  await unlink(target)

  return { path: safePath }
}
