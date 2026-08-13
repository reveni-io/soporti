import crypto from 'node:crypto'
import { and, eq, gt, inArray, lte } from 'drizzle-orm'
import { getDb } from './index.js'
import { attachmentImages } from './schema.js'
import config from '../config.js'

const DAY_MS = 24 * 60 * 60 * 1000

function toDataUri({ mimeType, data }) {
  return `data:${mimeType};base64,${data.toString('base64')}`
}

function owned(id, userId) {
  return and(eq(attachmentImages.id, id), eq(attachmentImages.userId, userId), unexpired())
}

function unexpired() {
  return gt(attachmentImages.expiresAt, new Date())
}

export async function createAttachmentImage({ userId, name, mimeType, buffer }) {
  const id = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + config.documents.imageRetentionDays * DAY_MS)

  await getDb().insert(attachmentImages).values({ id, userId, name, mimeType, data: buffer, expiresAt })

  return { id, expiresAt }
}

export async function setAttachmentImageThumbnail(id, userId, thumbnail) {
  const [updated] = await getDb()
    .update(attachmentImages)
    .set({ thumbnail })
    .where(owned(id, userId))
    .returning({ id: attachmentImages.id })

  return Boolean(updated)
}

export async function getAttachmentPreview(id, userId) {
  const [row] = await getDb()
    .select({ thumbnail: attachmentImages.thumbnail })
    .from(attachmentImages)
    .where(owned(id, userId))
    .limit(1)
  if (!row) return null
  if (row.thumbnail) return row.thumbnail

  const [full] = await getDb()
    .select({ mimeType: attachmentImages.mimeType, data: attachmentImages.data })
    .from(attachmentImages)
    .where(owned(id, userId))
    .limit(1)

  return full ? toDataUri(full) : null
}

export async function getAttachmentImages(ids, userId) {
  if (ids.length === 0) return new Map()

  const rows = await getDb()
    .select({ id: attachmentImages.id, mimeType: attachmentImages.mimeType, data: attachmentImages.data })
    .from(attachmentImages)
    .where(and(inArray(attachmentImages.id, ids), eq(attachmentImages.userId, userId), unexpired()))

  return new Map(rows.map(row => [row.id, toDataUri(row)]))
}

export async function deleteExpiredAttachmentImages() {
  const deleted = await getDb()
    .delete(attachmentImages)
    .where(lte(attachmentImages.expiresAt, new Date()))
    .returning({ id: attachmentImages.id })

  return deleted.length
}
