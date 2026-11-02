import { randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm'
import { getDb } from './index.js'
import { videoFiles, videoFrames, videoMessages, videoVersions, videos, videoAssets } from './schema.js'
import {
  VIDEO_KIND_COMPOSE,
  VIDEO_KIND_RENDER,
  VIDEO_PHASE_MUSIC,
  VIDEO_PHASE_PREPARING,
  VIDEO_ROLE_ASSISTANT,
  VIDEO_ROLE_USER,
  VIDEO_STAGE_PRODUCTION,
  VIDEO_STAGE_STORYBOARD,
  VIDEO_STATUS_CANCELLED,
  VIDEO_STATUS_FAILED,
  VIDEO_STATUS_QUEUED,
  VIDEO_STATUS_READY,
  VIDEO_STATUS_RUNNING,
} from '../constants.js'

const KEPT_VIDEOS_PER_VIDEO = 2
const ACTIVE_STATUSES = [VIDEO_STATUS_QUEUED, VIDEO_STATUS_RUNNING]
const RETRYABLE_STATUSES = [VIDEO_STATUS_FAILED, VIDEO_STATUS_CANCELLED]
const CLEARED_PROGRESS = { phase: null, progress: null, step: null, etaSeconds: null }

const versionColumns = {
  id: videoVersions.id,
  videoId: videoVersions.videoId,
  version: videoVersions.version,
  kind: videoVersions.kind,
  status: videoVersions.status,
  phase: videoVersions.phase,
  progress: videoVersions.progress,
  step: videoVersions.step,
  etaSeconds: videoVersions.etaSeconds,
  events: videoVersions.events,
  request: videoVersions.request,
  basedOn: videoVersions.basedOn,
  summary: videoVersions.summary,
  error: videoVersions.error,
  resume: videoVersions.resume,
  previewReady: videoVersions.previewReady,
  hasVideo: sql`${videoVersions.mp4} is not null`.mapWith(Boolean),
  hasThumbnail: sql`${videoVersions.thumbnail} is not null`.mapWith(Boolean),
  durationMs: videoVersions.durationMs,
  sizeBytes: videoVersions.sizeBytes,
  createdAt: videoVersions.createdAt,
  startedAt: videoVersions.startedAt,
  finishedAt: videoVersions.finishedAt,
}

const jobVideoColumns = {
  id: videos.id,
  userId: videos.userId,
  title: videos.title,
  brief: videos.brief,
  storyboard: videos.storyboard,
}

function ownedVideo(id, userId) {
  return and(eq(videos.id, id), eq(videos.userId, userId))
}

function ownedVideoIds(db, id, userId) {
  return db.select({ id: videos.id }).from(videos).where(ownedVideo(id, userId))
}

function ownedVersion(db, { videoId, userId, version }) {
  return and(inArray(videoVersions.videoId, ownedVideoIds(db, videoId, userId)), eq(videoVersions.version, version))
}

function touchVideo(tx, videoId) {
  return tx.update(videos).set({ updatedAt: new Date() }).where(eq(videos.id, videoId))
}

function insertMessage(tx, { videoId, role, content, version }) {
  return tx.insert(videoMessages).values({ videoId, role, content, version })
}

function startPhase(job) {
  return job.kind === VIDEO_KIND_RENDER || job.previewReady ? VIDEO_PHASE_MUSIC : VIDEO_PHASE_PREPARING
}

function lockVideo(tx, videoId, userId) {
  return tx
    .select({ id: videos.id, stage: videos.stage })
    .from(videos)
    .where(ownedVideo(videoId, userId))
    .for('update')
    .limit(1)
}

function listVersionStates(tx, videoId) {
  return tx
    .select({
      id: videoVersions.id,
      version: videoVersions.version,
      status: videoVersions.status,
      previewReady: videoVersions.previewReady,
    })
    .from(videoVersions)
    .where(eq(videoVersions.videoId, videoId))
    .orderBy(desc(videoVersions.version))
}

function isComposing(version) {
  if (version.status === VIDEO_STATUS_QUEUED) return true

  return version.status === VIDEO_STATUS_RUNNING && !version.previewReady
}

export async function startProduction(videoId, userId) {
  return getDb().transaction(async tx => {
    const [started] = await tx
      .update(videos)
      .set({ stage: VIDEO_STAGE_PRODUCTION, updatedAt: new Date() })
      .where(and(ownedVideo(videoId, userId), eq(videos.stage, VIDEO_STAGE_STORYBOARD), isNotNull(videos.storyboard)))
      .returning({ id: videos.id })
    if (!started) return false

    await tx
      .insert(videoVersions)
      .values({ videoId, version: 1, kind: VIDEO_KIND_COMPOSE, status: VIDEO_STATUS_QUEUED })

    return true
  })
}

async function cancelRenderingVersion(tx, latest) {
  if (latest?.status !== VIDEO_STATUS_RUNNING) return null

  await tx.update(videoVersions).set({ cancelRequested: true }).where(eq(videoVersions.id, latest.id))
  return latest.id
}

export async function createChangeRequest(videoId, userId, request) {
  return getDb().transaction(async tx => {
    const [video] = await lockVideo(tx, videoId, userId)
    if (!video) return { status: 'not_found' }
    if (video.stage !== VIDEO_STAGE_PRODUCTION) return { status: 'conflict' }

    const versions = await listVersionStates(tx, videoId)
    const [latest] = versions
    if (latest && isComposing(latest)) return { status: 'busy' }

    const cancelledVersionId = await cancelRenderingVersion(tx, latest)
    const version = (latest?.version ?? 0) + 1
    const basedOn = versions.find(item => item.previewReady)?.version ?? null

    await tx
      .insert(videoVersions)
      .values({ videoId, version, kind: VIDEO_KIND_COMPOSE, status: VIDEO_STATUS_QUEUED, request, basedOn })
    await insertMessage(tx, { videoId, role: VIDEO_ROLE_USER, content: request, version })
    await touchVideo(tx, videoId)

    return { status: 'ok', version, cancelledVersionId }
  })
}

async function copyFiles(tx, { fromVersionId, toVersionId }) {
  const rows = await tx
    .select({ path: videoFiles.path, content: videoFiles.content })
    .from(videoFiles)
    .where(eq(videoFiles.versionId, fromVersionId))
  if (rows.length === 0) return

  await tx.insert(videoFiles).values(rows.map(row => ({ ...row, versionId: toVersionId })))
}

async function copyAssets(tx, { fromVideoId, toVideoId }) {
  const rows = await tx
    .select({
      name: videoAssets.name,
      mimeType: videoAssets.mimeType,
      data: videoAssets.data,
      sha256: videoAssets.sha256,
    })
    .from(videoAssets)
    .where(eq(videoAssets.videoId, fromVideoId))
  if (rows.length === 0) return

  await tx.insert(videoAssets).values(rows.map(row => ({ ...row, videoId: toVideoId })))
}

function findNewestPreview(tx, videoId) {
  return tx
    .select({ id: videoVersions.id })
    .from(videoVersions)
    .where(and(eq(videoVersions.videoId, videoId), eq(videoVersions.previewReady, true)))
    .orderBy(desc(videoVersions.version))
    .limit(1)
}

export async function createVariant(sourceId, userId, request) {
  return getDb().transaction(async tx => {
    const [source] = await tx.select(jobVideoColumns).from(videos).where(ownedVideo(sourceId, userId)).limit(1)
    if (!source) return { status: 'not_found' }

    const [preview] = await findNewestPreview(tx, sourceId)
    if (!preview) return { status: 'conflict' }

    const id = randomUUID()
    const { title, brief, storyboard } = source
    await tx
      .insert(videos)
      .values({ id, userId, title, brief, storyboard, stage: VIDEO_STAGE_PRODUCTION, parentVideoId: sourceId })
    await copyAssets(tx, { fromVideoId: sourceId, toVideoId: id })

    const [version] = await tx
      .insert(videoVersions)
      .values({ videoId: id, version: 1, kind: VIDEO_KIND_COMPOSE, status: VIDEO_STATUS_QUEUED, request })
      .returning({ id: videoVersions.id })
    await copyFiles(tx, { fromVersionId: preview.id, toVersionId: version.id })
    await insertMessage(tx, { videoId: id, role: VIDEO_ROLE_USER, content: request, version: 1 })

    return { status: 'ok', id }
  })
}

export async function materializeVersionFiles(job) {
  if (job.basedOn === null) return false

  return getDb().transaction(async tx => {
    const [{ total }] = await tx.select({ total: count() }).from(videoFiles).where(eq(videoFiles.versionId, job.id))
    if (total > 0) return false

    const [base] = await tx
      .select({ id: videoVersions.id })
      .from(videoVersions)
      .where(and(eq(videoVersions.videoId, job.videoId), eq(videoVersions.version, job.basedOn)))
      .limit(1)
    if (!base) return false

    await copyFiles(tx, { fromVersionId: base.id, toVersionId: job.id })
    return true
  })
}

export async function claimNextVersion() {
  return getDb().transaction(async tx => {
    const [next] = await tx
      .select({ id: videoVersions.id, kind: videoVersions.kind, previewReady: videoVersions.previewReady })
      .from(videoVersions)
      .where(eq(videoVersions.status, VIDEO_STATUS_QUEUED))
      .orderBy(asc(videoVersions.queuedAt), asc(videoVersions.id))
      .limit(1)
      .for('update', { skipLocked: true })
    if (!next) return null

    const [version] = await tx
      .update(videoVersions)
      .set({
        status: VIDEO_STATUS_RUNNING,
        ...CLEARED_PROGRESS,
        phase: startPhase(next),
        error: null,
        cancelRequested: false,
        attempts: sql`${videoVersions.attempts} + 1`,
        startedAt: new Date(),
        finishedAt: null,
      })
      .where(eq(videoVersions.id, next.id))
      .returning(versionColumns)
    const [video] = await tx.select(jobVideoColumns).from(videos).where(eq(videos.id, version.videoId)).limit(1)

    return { ...version, video }
  })
}

export async function saveVersionProgress(id, fields) {
  const [saved] = await getDb()
    .update(videoVersions)
    .set(fields)
    .where(and(eq(videoVersions.id, id), eq(videoVersions.status, VIDEO_STATUS_RUNNING)))
    .returning({ cancelRequested: videoVersions.cancelRequested })

  return saved ?? null
}

export async function markPreviewReady(job, summary) {
  return getDb().transaction(async tx => {
    const [marked] = await tx
      .update(videoVersions)
      .set({ previewReady: true, summary })
      .where(and(eq(videoVersions.id, job.id), eq(videoVersions.status, VIDEO_STATUS_RUNNING)))
      .returning({ id: videoVersions.id })
    if (!marked) return false

    await insertMessage(tx, {
      videoId: job.videoId,
      role: VIDEO_ROLE_ASSISTANT,
      content: summary,
      version: job.version,
    })
    await touchVideo(tx, job.videoId)

    return true
  })
}

async function dropOlderVideos(tx, videoId) {
  const rendered = await tx
    .select({ id: videoVersions.id })
    .from(videoVersions)
    .where(and(eq(videoVersions.videoId, videoId), isNotNull(videoVersions.mp4)))
    .orderBy(desc(videoVersions.finishedAt), desc(videoVersions.id))
  const dropped = rendered.slice(KEPT_VIDEOS_PER_VIDEO).map(row => row.id)
  if (dropped.length === 0) return

  await tx.update(videoVersions).set({ mp4: null }).where(inArray(videoVersions.id, dropped))
}

export async function completeVersion(job, { mp4, thumbnail, durationMs, sizeBytes, message }) {
  return getDb().transaction(async tx => {
    const [completed] = await tx
      .update(videoVersions)
      .set({
        status: VIDEO_STATUS_READY,
        ...CLEARED_PROGRESS,
        progress: 100,
        mp4,
        thumbnail,
        durationMs,
        sizeBytes,
        finishedAt: new Date(),
      })
      .where(and(eq(videoVersions.id, job.id), eq(videoVersions.status, VIDEO_STATUS_RUNNING)))
      .returning({ id: videoVersions.id })
    if (!completed) return false

    await dropOlderVideos(tx, job.videoId)
    await insertMessage(tx, {
      videoId: job.videoId,
      role: VIDEO_ROLE_ASSISTANT,
      content: message,
      version: job.version,
    })
    await touchVideo(tx, job.videoId)

    return true
  })
}

export async function failVersion(job, { error, message }) {
  return getDb().transaction(async tx => {
    const [failed] = await tx
      .update(videoVersions)
      .set({ status: VIDEO_STATUS_FAILED, ...CLEARED_PROGRESS, error, finishedAt: new Date() })
      .where(and(eq(videoVersions.id, job.id), eq(videoVersions.status, VIDEO_STATUS_RUNNING)))
      .returning({ id: videoVersions.id })
    if (!failed) return false

    await insertMessage(tx, {
      videoId: job.videoId,
      role: VIDEO_ROLE_ASSISTANT,
      content: message,
      version: job.version,
    })
    await touchVideo(tx, job.videoId)

    return true
  })
}

export async function markVersionCancelled(id) {
  const [cancelled] = await getDb()
    .update(videoVersions)
    .set({ status: VIDEO_STATUS_CANCELLED, ...CLEARED_PROGRESS, finishedAt: new Date() })
    .where(and(eq(videoVersions.id, id), inArray(videoVersions.status, ACTIVE_STATUSES)))
    .returning({ id: videoVersions.id })

  return Boolean(cancelled)
}

export async function requeueInterruptedVersions() {
  return getDb().transaction(async tx => {
    await tx
      .update(videoVersions)
      .set({ status: VIDEO_STATUS_CANCELLED, ...CLEARED_PROGRESS, finishedAt: new Date() })
      .where(and(eq(videoVersions.status, VIDEO_STATUS_RUNNING), eq(videoVersions.cancelRequested, true)))
    const requeued = await tx
      .update(videoVersions)
      .set({ status: VIDEO_STATUS_QUEUED, ...CLEARED_PROGRESS, resume: true })
      .where(eq(videoVersions.status, VIDEO_STATUS_RUNNING))
      .returning({ id: videoVersions.id })

    return requeued.length
  })
}

async function cancelVersionRow(tx, latest) {
  if (latest.status === VIDEO_STATUS_QUEUED) {
    await tx
      .update(videoVersions)
      .set({ status: VIDEO_STATUS_CANCELLED, ...CLEARED_PROGRESS, finishedAt: new Date() })
      .where(eq(videoVersions.id, latest.id))
    return { status: 'cancelled', versionId: latest.id }
  }

  await tx.update(videoVersions).set({ cancelRequested: true }).where(eq(videoVersions.id, latest.id))
  return { status: 'cancelling', versionId: latest.id }
}

export async function cancelLatestVersion(videoId, userId) {
  return getDb().transaction(async tx => {
    const [video] = await lockVideo(tx, videoId, userId)
    if (!video) return { status: 'not_found' }

    const [latest] = await listVersionStates(tx, videoId)
    if (!latest || !ACTIVE_STATUSES.includes(latest.status)) return { status: 'idle' }

    return cancelVersionRow(tx, latest)
  })
}

export async function listActiveVersionIds(videoId, userId) {
  const db = getDb()
  const rows = await db
    .select({ id: videoVersions.id })
    .from(videoVersions)
    .where(
      and(
        inArray(videoVersions.videoId, ownedVideoIds(db, videoId, userId)),
        inArray(videoVersions.status, ACTIVE_STATUSES)
      )
    )

  return rows.map(row => row.id)
}

const REQUEUE_RULES = {
  retry: {
    where: inArray(videoVersions.status, RETRYABLE_STATUSES),
    set: { resume: true },
  },
  render: {
    where: and(
      eq(videoVersions.previewReady, true),
      isNull(videoVersions.mp4),
      notInArray(videoVersions.status, ACTIVE_STATUSES)
    ),
    set: { kind: VIDEO_KIND_RENDER, resume: false },
  },
}

export async function requeueVersion({ videoId, userId, version, mode }) {
  const db = getDb()
  const rule = REQUEUE_RULES[mode]
  const target = ownedVersion(db, { videoId, userId, version })

  const [requeued] = await db
    .update(videoVersions)
    .set({
      status: VIDEO_STATUS_QUEUED,
      ...CLEARED_PROGRESS,
      ...rule.set,
      error: null,
      cancelRequested: false,
      queuedAt: new Date(),
      finishedAt: null,
    })
    .where(and(target, rule.where))
    .returning({ id: videoVersions.id })
  if (requeued) return 'ok'

  const [existing] = await db.select({ id: videoVersions.id }).from(videoVersions).where(target).limit(1)
  return existing ? 'conflict' : 'not_found'
}

export async function listVersions(videoId) {
  return getDb()
    .select(versionColumns)
    .from(videoVersions)
    .where(eq(videoVersions.videoId, videoId))
    .orderBy(desc(videoVersions.version))
}

export async function listVersionSummaries(videoIds) {
  if (videoIds.length === 0) return []

  return getDb()
    .select({
      videoId: videoVersions.videoId,
      version: videoVersions.version,
      status: videoVersions.status,
      phase: videoVersions.phase,
      progress: videoVersions.progress,
      hasThumbnail: versionColumns.hasThumbnail,
    })
    .from(videoVersions)
    .where(inArray(videoVersions.videoId, videoIds))
    .orderBy(desc(videoVersions.version))
}

export async function listFrames(versionIds) {
  if (versionIds.length === 0) return []

  return getDb()
    .select({
      id: videoFrames.id,
      versionId: videoFrames.versionId,
      times: videoFrames.times,
      createdAt: videoFrames.createdAt,
    })
    .from(videoFrames)
    .where(inArray(videoFrames.versionId, versionIds))
    .orderBy(asc(videoFrames.id))
}

export async function getQueuePosition(versionId) {
  const [{ position }] = await getDb()
    .select({ position: count() })
    .from(videoVersions)
    .where(
      and(
        eq(videoVersions.status, VIDEO_STATUS_QUEUED),
        sql`(${videoVersions.queuedAt}, ${videoVersions.id}) <= (select queued_at, id from video_versions where id = ${versionId})`
      )
    )

  return Math.max(position, 1)
}

export async function getVersionSummary(videoId, version) {
  const [row] = await getDb()
    .select({ summary: videoVersions.summary })
    .from(videoVersions)
    .where(and(eq(videoVersions.videoId, videoId), eq(videoVersions.version, version)))
    .limit(1)

  return row?.summary ?? null
}

export async function getOwnedVersion({ videoId, userId, version }) {
  const db = getDb()
  const [row] = await db
    .select({ id: videoVersions.id, previewReady: videoVersions.previewReady })
    .from(videoVersions)
    .where(ownedVersion(db, { videoId, userId, version }))
    .limit(1)

  return row ?? null
}

const MEDIA_COLUMNS = { video: videoVersions.mp4, thumbnail: videoVersions.thumbnail }

export async function getVersionMedia({ videoId, userId, version, kind }) {
  const [row] = await getDb()
    .select({ title: videos.title, data: MEDIA_COLUMNS[kind] })
    .from(videoVersions)
    .innerJoin(videos, eq(videos.id, videoVersions.videoId))
    .where(and(ownedVideo(videoId, userId), eq(videoVersions.version, version)))
    .limit(1)

  return row?.data ? row : null
}
