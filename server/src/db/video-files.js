import { createHash } from 'node:crypto'
import { and, asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { getDb } from './index.js'
import { videoAssets, videoFiles, videoFrames, videoVersions, videos } from './schema.js'

const KEPT_FRAMES_PER_VERSION = 12

export async function listProjectFiles(versionId) {
  return getDb()
    .select({ path: videoFiles.path, bytes: sql`octet_length(${videoFiles.content})`.mapWith(Number) })
    .from(videoFiles)
    .where(eq(videoFiles.versionId, versionId))
    .orderBy(asc(videoFiles.path))
}

export async function readProjectFiles(versionId) {
  const rows = await getDb()
    .select({ path: videoFiles.path, content: videoFiles.content })
    .from(videoFiles)
    .where(eq(videoFiles.versionId, versionId))

  return Object.fromEntries(rows.map(row => [row.path, row.content]))
}

export async function readProjectFile(versionId, path) {
  const [row] = await getDb()
    .select({ content: videoFiles.content })
    .from(videoFiles)
    .where(and(eq(videoFiles.versionId, versionId), eq(videoFiles.path, path)))
    .limit(1)

  return row?.content ?? null
}

export async function saveProjectFile(versionId, path, content) {
  await getDb()
    .insert(videoFiles)
    .values({ versionId, path, content })
    .onConflictDoUpdate({ target: [videoFiles.versionId, videoFiles.path], set: { content } })
}

export async function deleteProjectFile(versionId, path) {
  const [deleted] = await getDb()
    .delete(videoFiles)
    .where(and(eq(videoFiles.versionId, versionId), eq(videoFiles.path, path)))
    .returning({ id: videoFiles.id })

  return Boolean(deleted)
}

export async function listVideoAssets(videoId) {
  return getDb()
    .select({
      name: videoAssets.name,
      mimeType: videoAssets.mimeType,
      bytes: sql`octet_length(${videoAssets.data})`.mapWith(Number),
    })
    .from(videoAssets)
    .where(eq(videoAssets.videoId, videoId))
    .orderBy(asc(videoAssets.name))
}

export async function loadVideoAssets(videoId) {
  const rows = await getDb()
    .select({ name: videoAssets.name, mimeType: videoAssets.mimeType, data: videoAssets.data })
    .from(videoAssets)
    .where(eq(videoAssets.videoId, videoId))

  return Object.fromEntries(rows.map(row => [row.name, { mimeType: row.mimeType, data: row.data }]))
}

export async function saveVideoAsset(videoId, { name, mimeType, data }) {
  const sha256 = createHash('sha256').update(data).digest('hex')

  await getDb()
    .insert(videoAssets)
    .values({ videoId, name, mimeType, data, sha256 })
    .onConflictDoUpdate({ target: [videoAssets.videoId, videoAssets.name], set: { mimeType, data, sha256 } })

  return sha256
}

export async function saveVersionFrame(versionId, { times, image }) {
  return getDb().transaction(async tx => {
    const [frame] = await tx.insert(videoFrames).values({ versionId, times, image }).returning({ id: videoFrames.id })
    const kept = tx
      .select({ id: videoFrames.id })
      .from(videoFrames)
      .where(eq(videoFrames.versionId, versionId))
      .orderBy(desc(videoFrames.id))
      .limit(KEPT_FRAMES_PER_VERSION)

    await tx.delete(videoFrames).where(and(eq(videoFrames.versionId, versionId), notInArray(videoFrames.id, kept)))

    return frame.id
  })
}

export async function getFrameImage(videoId, userId, frameId) {
  const owned = getDb()
    .select({ id: videoVersions.id })
    .from(videoVersions)
    .innerJoin(videos, eq(videos.id, videoVersions.videoId))
    .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))

  const [row] = await getDb()
    .select({ image: videoFrames.image })
    .from(videoFrames)
    .where(and(eq(videoFrames.id, frameId), inArray(videoFrames.versionId, owned)))
    .limit(1)

  return row?.image ?? null
}
