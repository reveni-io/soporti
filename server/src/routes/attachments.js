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
import { createAttachmentImage, getAttachmentPreview, setAttachmentImageThumbnail } from '../db/attachment-images.js'
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_MB,
  MAX_THUMBNAIL_CHARS,
  UUID_RE,
} from '../constants.js'

const router = Router()

const UNSUPPORTED_MESSAGE = `Unsupported file type. Supported formats: ${ATTACHMENT_EXTENSIONS.join(', ')}.`
const TOO_LARGE_MESSAGE = `The file is too large (max ${MAX_ATTACHMENT_MB} MB).`
const IMAGE_TOO_LARGE_MESSAGE = `The image is too large (max ${MAX_IMAGE_MB} MB). Resize it and attach it again.`
const IMAGE_CACHE_SECONDS = 24 * 60 * 60
const THUMBNAIL_DATA_URI_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/

function reject(req, res, status, error) {
  req.resume()
  return res.status(status).json({ error })
}

function parseThumbnail(value) {
  if (typeof value !== 'string' || !THUMBNAIL_DATA_URI_RE.test(value)) {
    return { error: 'A "thumbnail" data URI of a png, jpeg or webp image is required.' }
  }
  if (value.length > MAX_THUMBNAIL_CHARS) {
    return { error: `The thumbnail is too large (max ${MAX_THUMBNAIL_CHARS} characters).` }
  }

  return { value }
}

async function storeImage(res, { userId, name, mimeType, buffer }) {
  if (!looksLikeImage(buffer, mimeType)) {
    return res.status(422).json({ error: `"${name}" is not a valid image. It may be corrupt or renamed.` })
  }
  const bytes = Buffer.byteLength(buffer)
  if (bytes > MAX_IMAGE_BYTES) {
    return res.status(413).json({ error: IMAGE_TOO_LARGE_MESSAGE })
  }

  const { id, expiresAt } = await createAttachmentImage({ userId, name, mimeType, buffer })

  console.log(
    `[attachments] "${name}" (${mimeType}) → image ${id}, ${bytes} bytes, kept until ${expiresAt.toISOString()}`
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
    if (isImageAttachment(mimeType)) {
      return await storeImage(res, { userId: req.user.id, name, mimeType, buffer: req.body })
    }

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

router.put('/images/:id/thumbnail', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid image ID.' })

  const { error, value } = parseThumbnail(req.body?.thumbnail)
  if (error) return res.status(400).json({ error })

  try {
    const saved = await setAttachmentImageThumbnail(req.params.id, req.user.id, value)
    if (!saved) return res.status(404).json({ error: 'Image not found.' })

    res.json({ saved: true })
  } catch (err) {
    console.error('Failed to save the attachment thumbnail:', err)
    res.status(500).json({ error: 'Failed to save the thumbnail.' })
  }
})

router.get('/images/:id', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid image ID.' })

  try {
    const image = await getAttachmentPreview(req.params.id, req.user.id)
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
