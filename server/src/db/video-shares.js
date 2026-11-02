import { and, eq, gt, isNotNull } from 'drizzle-orm'
import { getDb } from './index.js'
import { newShareId } from './share-id.js'
import { videoShares, videoVersions, videos } from './schema.js'
import { SHARE_TTL_MS } from '../constants.js'

function sharedVersion() {
  return and(eq(videoVersions.videoId, videoShares.videoId), eq(videoVersions.version, videoShares.version))
}

export async function createOrRefreshVideoShare({ videoId, userId, version }) {
  const db = getDb()
  const [rendered] = await db
    .select({ id: videoVersions.id })
    .from(videoVersions)
    .innerJoin(videos, eq(videos.id, videoVersions.videoId))
    .where(
      and(
        eq(videos.id, videoId),
        eq(videos.userId, userId),
        eq(videoVersions.version, version),
        isNotNull(videoVersions.mp4)
      )
    )
    .limit(1)
  if (!rendered) return null

  const expiresAt = new Date(Date.now() + SHARE_TTL_MS)
  const [share] = await db
    .insert(videoShares)
    .values({ id: newShareId(), videoId, version, expiresAt })
    .onConflictDoUpdate({ target: [videoShares.videoId, videoShares.version], set: { expiresAt } })
    .returning({ id: videoShares.id })

  return share.id
}

export async function getSharedVideo(shareId) {
  const [row] = await getDb()
    .select({ title: videos.title, version: videoShares.version, mp4: videoVersions.mp4 })
    .from(videoShares)
    .innerJoin(videos, eq(videos.id, videoShares.videoId))
    .innerJoin(videoVersions, sharedVersion())
    .where(and(eq(videoShares.id, shareId), gt(videoShares.expiresAt, new Date()), isNotNull(videoVersions.mp4)))
    .limit(1)

  return row ?? null
}
