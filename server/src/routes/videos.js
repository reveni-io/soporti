import { Router } from 'express'
import { claimStoryboardDraft, createVideo, deleteVideo, getVideo, listVideoSummaries } from '../db/videos.js'
import {
  cancelLatestVersion,
  createChangeRequest,
  createVariant,
  getOwnedVersion,
  getQueuePosition,
  getVersionMedia,
  listActiveVersionIds,
  listFrames,
  listVersionSummaries,
  listVersions,
  requeueVersion,
  startProduction,
} from '../db/video-versions.js'
import { getFrameImage, loadVideoAssets, readProjectFiles } from '../db/video-files.js'
import { createOrRefreshVideoShare } from '../db/video-shares.js'
import { toVideoDetail, toVideoSummary } from '../db/video-render.js'
import { briefTitle, parseBrief } from '../video/brief.js'
import { cancelStoryboardDraft, startStoryboardDraft } from '../video/storyboard.js'
import { cancelVideoVersion, wakeVideoRunner } from '../video/runner.js'
import { bundleProject } from '../video/bundle.js'
import { loadKit } from '../video/kit.js'
import { sendMp4 } from '../video/mp4-response.js'
import { VideoProjectError } from '../video/project-error.js'
import { UUID_RE, VIDEO_STAGE_DRAFTING, VIDEO_STAGE_PRODUCTION, VIDEO_STATUS_QUEUED } from '../constants.js'

const MAX_MESSAGE_LENGTH = 4000
const POSITIVE_INT_RE = /^[1-9]\d{0,8}$/
const UNSAFE_FILENAME_RE = /[\\/:*?"<>|\p{Cc}]+/gu
const WHITESPACE_RE = /\s+/g
const DEFAULT_FILENAME = 'video'

const NOT_FOUND_ERROR = 'Video not found.'
const VERSION_NOT_FOUND_ERROR = 'Version not found.'
const DRAFTING_CONFLICT_ERROR = 'The storyboard is still being drafted. Wait for it to finish.'
const PRODUCTION_STORYBOARD_ERROR = 'The video is already in production: its storyboard cannot be drafted again.'
const BUSY_ERROR = 'The latest version is still being composed. Wait for it to finish or cancel it first.'
const GENERATE_CONFLICT_ERROR = 'Only a video with an approved storyboard that is not in production can be generated.'
const IDLE_ERROR = 'No version is queued or running.'
const REQUEUE_CONFLICTS = {
  retry: 'Only a failed or cancelled version can be retried.',
  render: 'Only a version whose preview is ready and whose MP4 is gone can be rendered again, once it has stopped.',
}

const STAGE_CONFLICTS = {
  messages: { [VIDEO_STAGE_DRAFTING]: DRAFTING_CONFLICT_ERROR },
  storyboard: {
    [VIDEO_STAGE_DRAFTING]: DRAFTING_CONFLICT_ERROR,
    [VIDEO_STAGE_PRODUCTION]: PRODUCTION_STORYBOARD_ERROR,
  },
}

const router = Router()

function parseText(value, noun) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return { error: `Write a ${noun}.` }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { error: `The ${noun} is too long (max ${MAX_MESSAGE_LENGTH} characters).` }
  }

  return { value: text }
}

function versionTarget(req) {
  return { videoId: req.params.id, userId: req.user.id, version: Number(req.params.version) }
}

function groupByVideo(rows) {
  const groups = new Map()
  for (const row of rows) groups.set(row.videoId, [...(groups.get(row.videoId) ?? []), row])

  return groups
}

async function loadDetail(id, userId) {
  const video = await getVideo(id, userId)
  if (!video) return null

  const versions = await listVersions(id)
  const frames = await listFrames(versions.map(version => version.id))
  const [latest] = versions
  const queuePosition = latest?.status === VIDEO_STATUS_QUEUED ? await getQueuePosition(latest.id) : null

  return toVideoDetail(video, { versions, frames, queuePosition })
}

async function sendDetail(res, status, id, userId) {
  const video = await loadDetail(id, userId)
  if (!video) return res.status(404).json({ error: NOT_FOUND_ERROR })

  res.status(status).json({ video })
}

async function redraftStoryboard(req, res, { video, action, request = null }) {
  const userId = req.user.id

  const conflict = STAGE_CONFLICTS[action][video.stage]
  if (conflict) return res.status(409).json({ error: conflict })
  if (!(await claimStoryboardDraft(video.id, userId, { request }))) {
    return res.status(409).json({ error: DRAFTING_CONFLICT_ERROR })
  }

  startStoryboardDraft(video.id, userId)
  await sendDetail(res, 202, video.id, userId)
}

async function requestChange(req, res, request) {
  const { id } = req.params

  const result = await createChangeRequest(id, req.user.id, request)
  if (result.status === 'not_found') return res.status(404).json({ error: NOT_FOUND_ERROR })
  if (result.status === 'busy') return res.status(409).json({ error: BUSY_ERROR })
  if (result.status === 'conflict') return res.status(409).json({ error: DRAFTING_CONFLICT_ERROR })

  if (result.cancelledVersionId) cancelVideoVersion(result.cancelledVersionId)
  wakeVideoRunner()
  await sendDetail(res, 202, id, req.user.id)
}

async function requeue(req, res, mode) {
  const status = await requeueVersion({ ...versionTarget(req), mode })
  if (status === 'not_found') return res.status(404).json({ error: VERSION_NOT_FOUND_ERROR })
  if (status === 'conflict') return res.status(409).json({ error: REQUEUE_CONFLICTS[mode] })

  wakeVideoRunner()
  await sendDetail(res, 202, req.params.id, req.user.id)
}

function downloadName(title, version) {
  const base = title.replace(UNSAFE_FILENAME_RE, ' ').replace(WHITESPACE_RE, ' ').trim() || DEFAULT_FILENAME
  return `${base} v${version}.mp4`
}

async function sendPreview(req, res) {
  const target = versionTarget(req)
  const version = await getOwnedVersion(target)
  if (!version) return res.status(404).json({ error: VERSION_NOT_FOUND_ERROR })
  if (!version.previewReady) return res.status(409).json({ error: 'The preview of this version is not ready yet.' })

  const [files, assets] = await Promise.all([readProjectFiles(version.id), loadVideoAssets(target.videoId)])
  const { html } = bundleProject({ files, assets, kit: loadKit(), mode: 'preview' })
  res.json({ html })
}

router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid video ID.' })

  next()
})

router.param('version', (req, res, next, version) => {
  if (!POSITIVE_INT_RE.test(version)) return res.status(400).json({ error: 'Invalid version.' })

  next()
})

router.param('frameId', (req, res, next, frameId) => {
  if (!POSITIVE_INT_RE.test(frameId)) return res.status(400).json({ error: 'Invalid frame ID.' })

  next()
})

router.get('/', async (req, res) => {
  try {
    const videos = await listVideoSummaries(req.user.id)
    const versions = groupByVideo(await listVersionSummaries(videos.map(video => video.id)))
    res.json({ videos: videos.map(video => toVideoSummary(video, versions.get(video.id))) })
  } catch (err) {
    console.error('Failed to list videos:', err)
    res.status(500).json({ error: 'Failed to load your videos.' })
  }
})

router.post('/', async (req, res) => {
  const userId = req.user.id

  try {
    const brief = await parseBrief(req.body?.brief, userId)
    if (brief.error) return res.status(400).json({ error: brief.error })

    const id = await createVideo(userId, { title: briefTitle(brief.value), brief: brief.value })
    startStoryboardDraft(id, userId)
    await sendDetail(res, 201, id, userId)
  } catch (err) {
    console.error('Failed to create a video:', err)
    res.status(500).json({ error: 'Failed to create the video.' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    await sendDetail(res, 200, req.params.id, req.user.id)
  } catch (err) {
    console.error('Failed to load a video:', err)
    res.status(500).json({ error: 'Failed to load the video.' })
  }
})

router.post('/:id/messages', async (req, res) => {
  const text = parseText(req.body?.text, 'message')
  if (text.error) return res.status(400).json({ error: text.error })

  try {
    const video = await getVideo(req.params.id, req.user.id)
    if (!video) return res.status(404).json({ error: NOT_FOUND_ERROR })
    if (video.stage === VIDEO_STAGE_PRODUCTION) return await requestChange(req, res, text.value)

    await redraftStoryboard(req, res, { video, action: 'messages', request: text.value })
  } catch (err) {
    console.error('Failed to send a video message:', err)
    res.status(500).json({ error: 'Failed to send the message.' })
  }
})

router.post('/:id/storyboard', async (req, res) => {
  try {
    const video = await getVideo(req.params.id, req.user.id)
    if (!video) return res.status(404).json({ error: NOT_FOUND_ERROR })

    await redraftStoryboard(req, res, { video, action: 'storyboard' })
  } catch (err) {
    console.error('Failed to draft a storyboard again:', err)
    res.status(500).json({ error: 'Failed to draft the storyboard again.' })
  }
})

router.post('/:id/generate', async (req, res) => {
  const { id } = req.params

  try {
    if (!(await startProduction(id, req.user.id))) {
      const video = await getVideo(id, req.user.id)
      if (!video) return res.status(404).json({ error: NOT_FOUND_ERROR })

      return res.status(409).json({ error: GENERATE_CONFLICT_ERROR })
    }

    wakeVideoRunner()
    await sendDetail(res, 202, id, req.user.id)
  } catch (err) {
    console.error('Failed to generate a video:', err)
    res.status(500).json({ error: 'Failed to start generating the video.' })
  }
})

router.post('/:id/cancel', async (req, res) => {
  const { id } = req.params

  try {
    const result = await cancelLatestVersion(id, req.user.id)
    if (result.status === 'not_found') return res.status(404).json({ error: NOT_FOUND_ERROR })
    if (result.status === 'idle') return res.status(409).json({ error: IDLE_ERROR })

    cancelVideoVersion(result.versionId)
    await sendDetail(res, 200, id, req.user.id)
  } catch (err) {
    console.error('Failed to cancel a video version:', err)
    res.status(500).json({ error: 'Failed to cancel the version.' })
  }
})

router.post('/:id/versions/:version/retry', async (req, res) => {
  try {
    await requeue(req, res, 'retry')
  } catch (err) {
    console.error('Failed to retry a video version:', err)
    res.status(500).json({ error: 'Failed to retry the version.' })
  }
})

router.post('/:id/versions/:version/render', async (req, res) => {
  try {
    await requeue(req, res, 'render')
  } catch (err) {
    console.error('Failed to render a video version again:', err)
    res.status(500).json({ error: 'Failed to render the version again.' })
  }
})

router.get('/:id/versions/:version/preview', async (req, res) => {
  try {
    await sendPreview(req, res)
  } catch (err) {
    if (err instanceof VideoProjectError) return res.status(422).json({ error: err.message })

    console.error('Failed to build a video preview:', err)
    res.status(500).json({ error: 'Failed to load the preview.' })
  }
})

router.get('/:id/versions/:version/video', async (req, res) => {
  try {
    const media = await getVersionMedia({ ...versionTarget(req), kind: 'video' })
    if (!media) return res.status(404).json({ error: 'This version has no MP4.' })

    res.attachment(downloadName(media.title, req.params.version))
    sendMp4(req, res, media.data)
  } catch (err) {
    console.error('Failed to send a video file:', err)
    res.status(500).json({ error: 'Failed to download the video.' })
  }
})

router.get('/:id/versions/:version/thumbnail', async (req, res) => {
  try {
    const media = await getVersionMedia({ ...versionTarget(req), kind: 'thumbnail' })
    if (!media) return res.status(404).json({ error: 'This version has no thumbnail.' })

    res.type('image/jpeg').send(media.data)
  } catch (err) {
    console.error('Failed to send a video thumbnail:', err)
    res.status(500).json({ error: 'Failed to load the thumbnail.' })
  }
})

router.get('/:id/frames/:frameId', async (req, res) => {
  try {
    const image = await getFrameImage(req.params.id, req.user.id, Number(req.params.frameId))
    if (!image) return res.status(404).json({ error: 'Frame not found.' })

    res.type('image/png').send(image)
  } catch (err) {
    console.error('Failed to send a video frame:', err)
    res.status(500).json({ error: 'Failed to load the frames.' })
  }
})

router.post('/:id/versions/:version/share', async (req, res) => {
  const target = versionTarget(req)

  try {
    if (!(await getOwnedVersion(target))) return res.status(404).json({ error: VERSION_NOT_FOUND_ERROR })

    const shareId = await createOrRefreshVideoShare(target)
    if (!shareId) return res.status(409).json({ error: 'This version has no MP4 to share. Render it first.' })

    res.json({ url: `/api/share/videos/${shareId}` })
  } catch (err) {
    console.error('Failed to share a video:', err)
    res.status(500).json({ error: 'Failed to share the video.' })
  }
})

router.post('/:id/variants', async (req, res) => {
  const request = parseText(req.body?.request, 'request')
  if (request.error) return res.status(400).json({ error: request.error })

  try {
    const result = await createVariant(req.params.id, req.user.id, request.value)
    if (result.status === 'not_found') return res.status(404).json({ error: NOT_FOUND_ERROR })
    if (result.status === 'conflict') {
      return res.status(409).json({ error: 'The video has no version with a ready preview to start a variant from.' })
    }

    wakeVideoRunner()
    await sendDetail(res, 201, result.id, req.user.id)
  } catch (err) {
    console.error('Failed to create a video variant:', err)
    res.status(500).json({ error: 'Failed to create the variant.' })
  }
})

router.delete('/:id', async (req, res) => {
  const { id } = req.params

  try {
    const activeVersionIds = await listActiveVersionIds(id, req.user.id)
    if (!(await deleteVideo(id, req.user.id))) return res.status(404).json({ error: NOT_FOUND_ERROR })

    cancelStoryboardDraft(id)
    activeVersionIds.forEach(cancelVideoVersion)
    res.status(204).end()
  } catch (err) {
    console.error('Failed to delete a video:', err)
    res.status(500).json({ error: 'Failed to delete the video.' })
  }
})

export default router
