import config from '../config.js'
import { MAX_ATTACHMENT_CHARS, MAX_ATTACHMENT_NAME_LENGTH } from '../constants.js'
import { redactSecrets } from '../review/output-guard.js'
import { parseDocx, parsePdf, parseXlsx } from './parsers.js'
import { acquireParseSlot } from './semaphore.js'

const PDF_MIME = 'application/pdf'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PNG_MIME = 'image/png'
const JPEG_MIME = 'image/jpeg'
const WEBP_MIME = 'image/webp'
const GIF_MIME = 'image/gif'

const DOCUMENT_TYPES = {
  [PDF_MIME]: { extensions: ['.pdf'], parse: parsePdf },
  [DOCX_MIME]: { extensions: ['.docx'], parse: parseDocx },
  [XLSX_MIME]: { extensions: ['.xlsx'], parse: parseXlsx },
}

const IMAGE_TYPES = {
  [PNG_MIME]: { extensions: ['.png'], signature: [{ offset: 0, hex: '89504e47' }] },
  [JPEG_MIME]: { extensions: ['.jpg', '.jpeg'], signature: [{ offset: 0, hex: 'ffd8ff' }] },
  [WEBP_MIME]: {
    extensions: ['.webp'],
    signature: [
      { offset: 0, hex: '52494646' },
      { offset: 8, hex: '57454250' },
    ],
  },
  [GIF_MIME]: { extensions: ['.gif'], signature: [{ offset: 0, hex: '47494638' }] },
}

const ATTACHMENT_TYPES = { ...DOCUMENT_TYPES, ...IMAGE_TYPES }

const PARSE_BUDGET_CHARS = MAX_ATTACHMENT_CHARS * 2
const FILE_NAME_RE = new RegExp(`^[^\\r\\n\\t/\\\\]{1,${MAX_ATTACHMENT_NAME_LENGTH}}$`)

export const ATTACHMENT_MIME_TYPES = Object.keys(ATTACHMENT_TYPES)
export const ATTACHMENT_EXTENSIONS = Object.values(ATTACHMENT_TYPES).flatMap(type => type.extensions)

export function isValidAttachmentName(name) {
  return typeof name === 'string' && FILE_NAME_RE.test(name.trim())
}

export function isSupportedAttachment(name, mimeType) {
  const type = ATTACHMENT_TYPES[mimeType]
  if (!type) return false

  const lowercased = name.toLowerCase()
  return type.extensions.some(extension => lowercased.endsWith(extension))
}

export function isImageAttachment(mimeType) {
  return mimeType in IMAGE_TYPES
}

export function looksLikeImage(buffer, mimeType) {
  const type = IMAGE_TYPES[mimeType]
  if (!type) return false

  return type.signature.every(
    ({ offset, hex }) => buffer.subarray(offset, offset + hex.length / 2).toString('hex') === hex
  )
}

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('parse timed out')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export async function extractAttachmentText(buffer, mimeType) {
  const release = await acquireParseSlot()
  let extracted
  try {
    extracted = await withTimeout(
      ATTACHMENT_TYPES[mimeType].parse(buffer, PARSE_BUDGET_CHARS),
      config.documents.parseTimeoutMs
    )
  } catch (err) {
    return { error: err?.message === 'parse timed out' ? 'timeout' : 'parse_failed' }
  } finally {
    release()
  }

  const cleaned = redactSecrets(typeof extracted === 'string' ? extracted : '').trim()
  if (!cleaned) return { error: 'empty' }

  const truncated = cleaned.length > MAX_ATTACHMENT_CHARS

  return { text: truncated ? cleaned.slice(0, MAX_ATTACHMENT_CHARS) : cleaned, truncated }
}
