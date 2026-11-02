import { Router } from 'express'
import { claimStoryboardDraft, createVideo, deleteVideo, getVideo, listVideoSummaries } from '../db/videos.js'
import { toVideoDetail, toVideoSummary } from '../db/video-render.js'
import { briefTitle, parseBrief } from '../video/brief.js'
import { cancelStoryboardDraft, startStoryboardDraft } from '../video/storyboard.js'
import { UUID_RE, VIDEO_STAGE_DRAFTING, VIDEO_STAGE_PRODUCTION } from '../constants.js'

const MAX_MESSAGE_LENGTH = 4000

const NOT_FOUND_ERROR = 'Video not found.'
const DRAFTING_CONFLICT_ERROR = 'The storyboard is still being drafted. Wait for it to finish.'
const PRODUCTION_MESSAGE_ERROR = 'Change requests arrive with video generation.'
const PRODUCTION_STORYBOARD_ERROR = 'The video is already in production: its storyboard cannot be drafted again.'

const STAGE_CONFLICTS = {
  messages: { [VIDEO_STAGE_DRAFTING]: DRAFTING_CONFLICT_ERROR, [VIDEO_STAGE_PRODUCTION]: PRODUCTION_MESSAGE_ERROR },
  storyboard: {
    [VIDEO_STAGE_DRAFTING]: DRAFTING_CONFLICT_ERROR,
    [VIDEO_STAGE_PRODUCTION]: PRODUCTION_STORYBOARD_ERROR,
  },
}

const router = Router()

function parseText(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return { error: 'Write a message.' }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { error: `The message is too long (max ${MAX_MESSAGE_LENGTH} characters).` }
  }

  return { value: text }
}

async function sendDetail(res, status, id, userId) {
  const video = await getVideo(id, userId)
  if (!video) return res.status(404).json({ error: NOT_FOUND_ERROR })

  res.status(status).json({ video: toVideoDetail(video) })
}

async function redraftStoryboard(req, res, { action, request = null }) {
  const { id } = req.params
  const userId = req.user.id

  const video = await getVideo(id, userId)
  if (!video) return res.status(404).json({ error: NOT_FOUND_ERROR })

  const conflict = STAGE_CONFLICTS[action][video.stage]
  if (conflict) return res.status(409).json({ error: conflict })
  if (!(await claimStoryboardDraft(id, userId, { request }))) {
    return res.status(409).json({ error: DRAFTING_CONFLICT_ERROR })
  }

  startStoryboardDraft(id, userId)
  await sendDetail(res, 202, id, userId)
}

router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid video ID.' })

  next()
})

router.get('/', async (req, res) => {
  try {
    const videos = await listVideoSummaries(req.user.id)
    res.json({ videos: videos.map(toVideoSummary) })
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
  const text = parseText(req.body?.text)
  if (text.error) return res.status(400).json({ error: text.error })

  try {
    await redraftStoryboard(req, res, { action: 'messages', request: text.value })
  } catch (err) {
    console.error('Failed to send a video message:', err)
    res.status(500).json({ error: 'Failed to send the message.' })
  }
})

router.post('/:id/storyboard', async (req, res) => {
  try {
    await redraftStoryboard(req, res, { action: 'storyboard' })
  } catch (err) {
    console.error('Failed to draft a storyboard again:', err)
    res.status(500).json({ error: 'Failed to draft the storyboard again.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteVideo(req.params.id, req.user.id)
    if (!deleted) return res.status(404).json({ error: NOT_FOUND_ERROR })

    cancelStoryboardDraft(req.params.id)
    res.status(204).end()
  } catch (err) {
    console.error('Failed to delete a video:', err)
    res.status(500).json({ error: 'Failed to delete the video.' })
  }
})

export default router
