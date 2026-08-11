import { Router, raw } from 'express'
import {
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_MIME_TYPES,
  extractAttachmentText,
  isSupportedAttachment,
  isValidAttachmentName,
} from '../documents/attachments.js'
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_MB } from '../constants.js'

const router = Router()

const UNSUPPORTED_MESSAGE = `Unsupported file type. Supported formats: ${ATTACHMENT_EXTENSIONS.join(', ')}.`
const TOO_LARGE_MESSAGE = `The file is too large (max ${MAX_ATTACHMENT_MB} MB).`

function reject(req, res, status, error) {
  req.resume()
  return res.status(status).json({ error })
}

router.post('/', raw({ type: ATTACHMENT_MIME_TYPES, limit: MAX_ATTACHMENT_BYTES }), async (req, res) => {
  if (!isValidAttachmentName(req.query.name)) return reject(req, res, 400, 'A valid file name is required.')

  const name = req.query.name.trim()
  const mimeType = String(req.headers['content-type'] || '')
    .split(';')[0]
    .trim()
  if (!isSupportedAttachment(name, mimeType)) return reject(req, res, 400, UNSUPPORTED_MESSAGE)
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return reject(req, res, 400, 'The file is empty.')

  try {
    const { error, text, truncated } = await extractAttachmentText(req.body, mimeType)

    if (error === 'empty') {
      return res.status(422).json({ error: `No text could be extracted from "${name}". It may be a scanned document.` })
    }
    if (error === 'timeout') {
      return res.status(422).json({ error: `Reading "${name}" took too long. It may be very large or malformed.` })
    }
    if (error) {
      return res
        .status(422)
        .json({ error: `Could not read "${name}". It may be corrupt, encrypted or password-protected.` })
    }

    console.log(`[attachments] "${name}" (${mimeType}) → ${text.length} chars${truncated ? ' (truncated)' : ''}`)

    res.json({ attachment: { name, text, truncated } })
  } catch (err) {
    console.error('Failed to extract the attachment text:', err)
    res.status(500).json({ error: 'Failed to read the file.' })
  }
})

router.use((err, req, res, _next) => {
  if (err?.type === 'entity.too.large') return reject(req, res, 413, TOO_LARGE_MESSAGE)

  console.error('Failed to receive the attachment:', err)
  reject(req, res, 500, 'Failed to read the file.')
})

export default router
