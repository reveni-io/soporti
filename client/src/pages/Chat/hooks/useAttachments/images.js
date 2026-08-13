import {
  IMAGE_MAX_PIXELS,
  MAX_IMAGE_BYTES,
  SHRINK_ATTEMPTS,
  SHRINK_MIME_TYPE,
  SHRINK_QUALITY,
  SHRINK_STEP,
  THUMBNAIL_MAX_PIXELS,
  THUMBNAIL_MIME_TYPE,
  THUMBNAIL_QUALITY,
} from '../../../../constants.js'

function scaledSize(width, height, maxPixels) {
  const longestSide = Math.max(width, height)
  if (longestSide <= maxPixels) return { width, height }

  const ratio = maxPixels / longestSide
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}

async function decode(file) {
  if (typeof createImageBitmap !== 'function') return null

  try {
    return await createImageBitmap(file)
  } catch {
    return null
  }
}

function draw(bitmap, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) return null

  context.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

function toBlob(canvas, mimeType, quality) {
  return new Promise(resolve => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null)
      return
    }
    canvas.toBlob(blob => resolve(blob), mimeType, quality)
  })
}

export async function buildThumbnail(file) {
  const bitmap = await decode(file)
  if (!bitmap) return null

  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height, THUMBNAIL_MAX_PIXELS)
    const canvas = draw(bitmap, width, height)
    if (!canvas) return null

    const dataUri = canvas.toDataURL(THUMBNAIL_MIME_TYPE, THUMBNAIL_QUALITY)

    return dataUri?.startsWith(`data:${THUMBNAIL_MIME_TYPE};base64,`) ? dataUri : null
  } catch {
    return null
  } finally {
    bitmap.close?.()
  }
}

export function needsShrinking(file, width, height) {
  return file.size > MAX_IMAGE_BYTES || Math.max(width, height) > IMAGE_MAX_PIXELS
}

export async function shrinkImage(file) {
  const bitmap = await decode(file)
  if (!bitmap) return file

  try {
    if (!needsShrinking(file, bitmap.width, bitmap.height)) return file

    let maxPixels = Math.min(IMAGE_MAX_PIXELS, Math.max(bitmap.width, bitmap.height))
    for (let attempt = 0; attempt < SHRINK_ATTEMPTS; attempt++) {
      const { width, height } = scaledSize(bitmap.width, bitmap.height, maxPixels)
      const canvas = draw(bitmap, width, height)
      if (!canvas) return file

      const blob = await toBlob(canvas, SHRINK_MIME_TYPE, SHRINK_QUALITY)
      if (!blob) return file
      if (blob.size <= MAX_IMAGE_BYTES) {
        return new File([blob], `${file.name.replace(/\.[^.]*$/, '')}.webp`, { type: SHRINK_MIME_TYPE })
      }

      maxPixels = Math.max(1, Math.round(maxPixels * SHRINK_STEP))
    }

    return file
  } catch {
    return file
  } finally {
    bitmap.close?.()
  }
}
