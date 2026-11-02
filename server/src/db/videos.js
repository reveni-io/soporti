import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq } from 'drizzle-orm'
import { getDb } from './index.js'
import { videoMessages, videos } from './schema.js'
import { VIDEO_ROLE_ASSISTANT, VIDEO_ROLE_USER, VIDEO_STAGE_DRAFTING, VIDEO_STAGE_STORYBOARD } from '../constants.js'

const summaryColumns = {
  id: videos.id,
  title: videos.title,
  stage: videos.stage,
  brief: videos.brief,
  updatedAt: videos.updatedAt,
}

const detailColumns = {
  ...summaryColumns,
  storyboard: videos.storyboard,
  storyboardError: videos.storyboardError,
  parentVideoId: videos.parentVideoId,
  createdAt: videos.createdAt,
}

const messageColumns = {
  id: videoMessages.id,
  role: videoMessages.role,
  content: videoMessages.content,
  version: videoMessages.version,
  createdAt: videoMessages.createdAt,
}

function ownedVideo(id, userId) {
  return and(eq(videos.id, id), eq(videos.userId, userId))
}

function ownedVideoInStage(id, userId, stage) {
  return and(ownedVideo(id, userId), eq(videos.stage, stage))
}

export async function createVideo(userId, { title, brief, parentVideoId = null }) {
  const [row] = await getDb()
    .insert(videos)
    .values({ id: randomUUID(), userId, title, brief, stage: VIDEO_STAGE_DRAFTING, parentVideoId })
    .returning({ id: videos.id })

  return row.id
}

export async function listVideoSummaries(userId) {
  return getDb().select(summaryColumns).from(videos).where(eq(videos.userId, userId)).orderBy(desc(videos.createdAt))
}

export async function getVideo(id, userId) {
  const [video] = await getDb().select(detailColumns).from(videos).where(ownedVideo(id, userId)).limit(1)
  if (!video) return null

  const messages = await getDb()
    .select(messageColumns)
    .from(videoMessages)
    .where(eq(videoMessages.videoId, id))
    .orderBy(asc(videoMessages.id))

  return { ...video, messages }
}

export async function claimStoryboardDraft(id, userId, { request = null } = {}) {
  return getDb().transaction(async tx => {
    const [claimed] = await tx
      .update(videos)
      .set({ stage: VIDEO_STAGE_DRAFTING, storyboardError: null, updatedAt: new Date() })
      .where(ownedVideoInStage(id, userId, VIDEO_STAGE_STORYBOARD))
      .returning({ id: videos.id })
    if (!claimed) return false

    if (request) await tx.insert(videoMessages).values({ videoId: id, role: VIDEO_ROLE_USER, content: request })

    return true
  })
}

export async function saveStoryboard(id, userId, { title, storyboard, reply }) {
  return getDb().transaction(async tx => {
    const [saved] = await tx
      .update(videos)
      .set({ title, storyboard, stage: VIDEO_STAGE_STORYBOARD, storyboardError: null, updatedAt: new Date() })
      .where(ownedVideoInStage(id, userId, VIDEO_STAGE_DRAFTING))
      .returning({ id: videos.id })
    if (!saved) return false

    await tx.insert(videoMessages).values({ videoId: id, role: VIDEO_ROLE_ASSISTANT, content: reply })

    return true
  })
}

export async function failStoryboard(id, userId, error) {
  const [failed] = await getDb()
    .update(videos)
    .set({ stage: VIDEO_STAGE_STORYBOARD, storyboardError: error, updatedAt: new Date() })
    .where(ownedVideoInStage(id, userId, VIDEO_STAGE_DRAFTING))
    .returning({ id: videos.id })

  return Boolean(failed)
}

export async function failInterruptedStoryboards(error) {
  const failed = await getDb()
    .update(videos)
    .set({ stage: VIDEO_STAGE_STORYBOARD, storyboardError: error, updatedAt: new Date() })
    .where(eq(videos.stage, VIDEO_STAGE_DRAFTING))
    .returning({ id: videos.id })

  return failed.length
}

export async function deleteVideo(id, userId) {
  const [deleted] = await getDb().delete(videos).where(ownedVideo(id, userId)).returning({ id: videos.id })

  return Boolean(deleted)
}
