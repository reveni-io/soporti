import crypto from 'node:crypto'
import { and, eq, gt, inArray, lte } from 'drizzle-orm'
import { getDb } from './index.js'
import { attachmentImages } from './schema.js'
import config from '../config.js'

const DAY_MS = 24 * 60 * 60 * 1000

function toDataUri({ mimeType, data }) {
  return `data:${mimeType};base64,${data}`
}

export async function createAttachmentImage({ userId, name, mimeType, buffer }) {
  const id = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + config.documents.imageRetentionDays * DAY_MS)

  await getDb()
    .insert(attachmentImages)
    .values({
      id,
      userId,
      name,
      mimeType,
      data: buffer.toString('base64'),
      byteSize: buffer.length,
      expiresAt,
    })

  return { id, expiresAt }
}

export async function getAttachmentImage(id, userId) {
  const [row] = await getDb()
    .select({ name: attachmentImages.name, mimeType: attachmentImages.mimeType, data: attachmentImages.data })
    .from(attachmentImages)
    .where(
      and(eq(attachmentImages.id, id), eq(attachmentImages.userId, userId), gt(attachmentImages.expiresAt, new Date()))
    )
    .limit(1)
  if (!row) return null

  return { name: row.name, image: toDataUri(row) }
}

export async function getAttachmentImages(ids, userId) {
  if (ids.length === 0) return new Map()

  const rows = await getDb()
    .select({ id: attachmentImages.id, mimeType: attachmentImages.mimeType, data: attachmentImages.data })
    .from(attachmentImages)
    .where(
      and(
        inArray(attachmentImages.id, ids),
        eq(attachmentImages.userId, userId),
        gt(attachmentImages.expiresAt, new Date())
      )
    )

  return new Map(rows.map(row => [row.id, toDataUri(row)]))
}

export async function deleteExpiredAttachmentImages() {
  const deleted = await getDb()
    .delete(attachmentImages)
    .where(lte(attachmentImages.expiresAt, new Date()))
    .returning({ id: attachmentImages.id })

  return deleted.length
}
