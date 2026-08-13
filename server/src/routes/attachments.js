import { Router, raw } from 'express'
import {
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_MIME_TYPES,
  extractAttachmentText,
  isImageAttachment,
  isSupportedAttachment,
  isValidAttachmentName,
  looksLikeImage,
} from '../documents/attachments.js'
import { createAttachmentImage, getAttachmentImage } from '../db/attachment-images.js'
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_MB, UUID_RE } from '../constants.js'

const router = Router()

const UNSUPPORTED_MESSAGE = `Unsupported file type. Supported formats: ${ATTACHMENT_EXTENSIONS.join(', ')}.`
const TOO_LARGE_MESSAGE = `The file is too large (max ${MAX_ATTACHMENT_MB} MB).`
const IMAGE_CACHE_SECONDS = 24 * 60 * 60

function reject(req, res, status, error) {
  req.resume()
  return res.status(status).json({ error })
}

async function storeImage(req, res, name, mimeType) {
  if (!looksLikeImage(req.body, mimeType)) {
    return res.status(422).json({ error: `"${name}" is not a valid image. It may be corrupt or renamed.` })
  }

  const { id, expiresAt } = await createAttachmentImage({
    userId: req.user.id,
    name,
    mimeType,
    buffer: req.body,
  })

  console.log(
    `[attachments] "${name}" (${mimeType}) → image ${id}, ${req.body.length} bytes, kept until ${expiresAt.toISOString()}`
  )

  res.json({ attachment: { name, imageId: id } })
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
    if (isImageAttachment(mimeType)) return await storeImage(req, res, name, mimeType)

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
    console.error('Failed to read the attachment:', err)
    res.status(500).json({ error: 'Failed to read the file.' })
  }
})

router.get('/images/:id', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid image ID.' })

  try {
    const image = await getAttachmentImage(req.params.id, req.user.id)
    if (!image) return res.status(404).json({ error: 'Image not found.' })

    res.set('Cache-Control', `private, max-age=${IMAGE_CACHE_SECONDS}, immutable`).json({ image })
  } catch (err) {
    console.error('Failed to load the attachment image:', err)
    res.status(500).json({ error: 'Failed to load the image.' })
  }
})

router.use((err, req, res, _next) => {
  if (err?.type === 'entity.too.large') return reject(req, res, 413, TOO_LARGE_MESSAGE)

  console.error('Failed to receive the attachment:', err)
  reject(req, res, 500, 'Failed to read the file.')
})

export default router
