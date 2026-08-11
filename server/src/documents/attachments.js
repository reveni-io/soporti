import config from '../config.js'
import { MAX_ATTACHMENT_CHARS, MAX_ATTACHMENT_NAME_LENGTH } from '../constants.js'
import { redactSecrets } from '../review/output-guard.js'
import { parseDocx, parsePdf, parseXlsx } from './parsers.js'
import { acquireParseSlot } from './semaphore.js'

const PDF_MIME = 'application/pdf'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const ATTACHMENT_TYPES = {
  [PDF_MIME]: { extension: '.pdf', parse: parsePdf },
  [DOCX_MIME]: { extension: '.docx', parse: parseDocx },
  [XLSX_MIME]: { extension: '.xlsx', parse: parseXlsx },
}

const PARSE_BUDGET_CHARS = MAX_ATTACHMENT_CHARS * 2
const FILE_NAME_RE = new RegExp(`^[^\\r\\n\\t/\\\\]{1,${MAX_ATTACHMENT_NAME_LENGTH}}$`)

export const ATTACHMENT_MIME_TYPES = Object.keys(ATTACHMENT_TYPES)
export const ATTACHMENT_EXTENSIONS = Object.values(ATTACHMENT_TYPES).map(type => type.extension)

export function isValidAttachmentName(name) {
  return typeof name === 'string' && FILE_NAME_RE.test(name.trim())
}

export function isSupportedAttachment(name, mimeType) {
  const type = ATTACHMENT_TYPES[mimeType]
  if (!type) return false

  return name.toLowerCase().endsWith(type.extension)
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
