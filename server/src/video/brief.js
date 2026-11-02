import { listRepos } from '../github/client.js'
import { findOwnedAttachmentImageIds } from '../db/attachment-images.js'
import { isValidAttachmentName } from '../documents/attachments.js'
import { UUID_RE } from '../constants.js'

const MAX_IDEA_LENGTH = 4000
const MAX_REPOS = 5
const MAX_PATH_LENGTH = 300
const MAX_ATTACHMENTS = 5
const MAX_DOCUMENT_CHARS = 20_000
const MAX_TITLE_LENGTH = 80
const ELLIPSIS = '…'
const SLASH = '/'
const INVALID_PATH_ERROR = 'The folder must be a path inside the repo, like "apps/dashboard/src".'
const PATH_RE = /^[\w.-]+(\/[\w.-]+)*$/
const DOT_SEGMENT_RE = /(^|\/)\.{1,2}(\/|$)/
const WHITESPACE_RE = /\s+/g

const CHOICE_FIELDS = {
  audience: ['merchants', 'internal', 'sales', 'developers'],
  language: ['en', 'es'],
  format: ['16:9', '1:1', '9:16'],
  durationSeconds: [20, 30, 60, 90],
  pace: ['relaxed', 'normal', 'fast'],
}

function trimmedString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseIdea(value) {
  const idea = trimmedString(value)
  if (!idea) return { error: 'Describe the idea of the video.' }
  if (idea.length > MAX_IDEA_LENGTH) return { error: `The idea is too long (max ${MAX_IDEA_LENGTH} characters).` }

  return { value: idea }
}

async function parseRepos(value) {
  if (!Array.isArray(value) || value.length === 0) return { error: 'Pick at least one repo.' }
  if (value.length > MAX_REPOS) return { error: `Pick at most ${MAX_REPOS} repos.` }

  const repos = [...new Set(value.map(trimmedString))]
  const available = new Set((await listRepos()).map(repo => repo.fullName))
  const unavailable = repos.find(repo => !available.has(repo))
  if (unavailable !== undefined) return { error: `The repo ${unavailable || '(empty)'} is not available.` }

  return { value: repos }
}

function trimEdgeSlashes(path) {
  let start = 0
  let end = path.length

  while (start < end && path[start] === SLASH) start++
  while (end > start && path[end - 1] === SLASH) end--

  return path.slice(start, end)
}

function parsePath(value) {
  if (value === undefined || value === null) return { value: null }
  if (typeof value !== 'string') return { error: 'The folder must be a path inside the repo.' }
  if (value.length > MAX_PATH_LENGTH) return { error: INVALID_PATH_ERROR }

  const path = trimEdgeSlashes(value.trim())
  if (!path) return { value: null }
  if (!PATH_RE.test(path) || DOT_SEGMENT_RE.test(path)) return { error: INVALID_PATH_ERROR }

  return { value: path }
}

function parseChoices(brief) {
  const value = {}
  for (const [field, options] of Object.entries(CHOICE_FIELDS)) {
    if (!options.includes(brief[field])) return { error: `"${field}" must be one of: ${options.join(', ')}.` }

    value[field] = brief[field]
  }

  return { value }
}

function parseAttachment(item) {
  const name = trimmedString(item?.name)
  const text = trimmedString(item?.text)
  const imageId = trimmedString(item?.imageId)

  if (!isValidAttachmentName(name)) return { error: 'Each attachment needs a valid file name.' }
  if (imageId) {
    return UUID_RE.test(imageId) ? { value: { name, imageId } } : { error: `"${name}" has an invalid image ID.` }
  }
  if (!text) return { error: `"${name}" needs its extracted text or an image ID.` }

  return { value: { name, text: text.slice(0, MAX_DOCUMENT_CHARS) } }
}

async function findMissingImage(attachments, userId) {
  const images = attachments.filter(attachment => attachment.imageId)
  const owned = await findOwnedAttachmentImageIds(
    images.map(image => image.imageId),
    userId
  )

  return images.find(image => !owned.has(image.imageId)) ?? null
}

async function parseAttachments(value, userId) {
  if (value === undefined || value === null) return { value: [] }
  if (!Array.isArray(value)) return { error: 'Attachments must be a list.' }
  if (value.length > MAX_ATTACHMENTS) return { error: `Attach at most ${MAX_ATTACHMENTS} files.` }

  const parsed = value.map(parseAttachment)
  const invalid = parsed.find(attachment => attachment.error)
  if (invalid) return invalid

  const attachments = parsed.map(attachment => attachment.value)
  const missing = await findMissingImage(attachments, userId)
  if (missing) return { error: `The image "${missing.name}" is no longer available. Attach it again.` }

  return { value: attachments }
}

function parseSyncFields(brief) {
  const idea = parseIdea(brief.idea)
  if (idea.error) return idea

  const path = parsePath(brief.path)
  if (path.error) return path

  const choices = parseChoices(brief)
  if (choices.error) return choices

  return { value: { idea: idea.value, path: path.value, ...choices.value } }
}

export async function parseBrief(brief, userId) {
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) return { error: 'A "brief" object is required.' }

  const fields = parseSyncFields(brief)
  if (fields.error) return fields

  const attachments = await parseAttachments(brief.attachments, userId)
  if (attachments.error) return attachments

  const repos = await parseRepos(brief.repos)
  if (repos.error) return repos

  const { idea, path, audience, language, format, durationSeconds, pace } = fields.value

  return {
    value: {
      idea,
      repos: repos.value,
      path,
      audience,
      language,
      format,
      durationSeconds,
      pace,
      attachments: attachments.value,
    },
  }
}

export function briefTitle(brief) {
  const firstLine = brief.idea.split('\n')[0].replace(WHITESPACE_RE, ' ').trim()
  if (firstLine.length <= MAX_TITLE_LENGTH) return firstLine

  return `${firstLine.slice(0, MAX_TITLE_LENGTH - ELLIPSIS.length).trimEnd()}${ELLIPSIS}`
}
