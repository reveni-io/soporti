import { THUMBNAIL_MAX_PIXELS, THUMBNAIL_MIME_TYPE, THUMBNAIL_QUALITY } from '../../../../constants.js'

function scaledSize(width, height) {
  const longestSide = Math.max(width, height)
  if (longestSide <= THUMBNAIL_MAX_PIXELS) return { width, height }

  const ratio = THUMBNAIL_MAX_PIXELS / longestSide
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}

export async function buildThumbnail(file) {
  if (typeof createImageBitmap !== 'function') return null

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }

  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) return null

    context.drawImage(bitmap, 0, 0, width, height)
    const dataUri = canvas.toDataURL(THUMBNAIL_MIME_TYPE, THUMBNAIL_QUALITY)

    return dataUri?.startsWith(`data:${THUMBNAIL_MIME_TYPE};base64,`) ? dataUri : null
  } catch {
    return null
  } finally {
    bitmap.close?.()
  }
}
