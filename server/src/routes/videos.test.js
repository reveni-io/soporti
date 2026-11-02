import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { exampleProjectFixture } from '../video/__fixtures__/example-project.js'

vi.mock('../db/videos.js', () => {
  return {
    listVideoSummaries: vi.fn(),
    createVideo: vi.fn(),
    getVideo: vi.fn(),
    claimStoryboardDraft: vi.fn(),
    deleteVideo: vi.fn(),
  }
})
vi.mock('../db/video-versions.js', () => {
  return {
    cancelLatestVersion: vi.fn(),
    createChangeRequest: vi.fn(),
    createVariant: vi.fn(),
    getOwnedVersion: vi.fn(),
    getQueuePosition: vi.fn(),
    getVersionMedia: vi.fn(),
    listActiveVersionIds: vi.fn(),
    listFrames: vi.fn(),
    listVersionSummaries: vi.fn(),
    listVersions: vi.fn(),
    requeueVersion: vi.fn(),
    startProduction: vi.fn(),
  }
})
vi.mock('../db/video-files.js', () => {
  return { getFrameImage: vi.fn(), loadVideoAssets: vi.fn(), readProjectFiles: vi.fn() }
})
vi.mock('../db/video-shares.js', () => ({ createOrRefreshVideoShare: vi.fn() }))
vi.mock('../video/brief.js', () => ({ parseBrief: vi.fn(), briefTitle: vi.fn() }))
vi.mock('../video/storyboard.js', () => ({ startStoryboardDraft: vi.fn(), cancelStoryboardDraft: vi.fn() }))
vi.mock('../video/runner.js', () => ({ cancelVideoVersion: vi.fn(), wakeVideoRunner: vi.fn() }))

const { listVideoSummaries, createVideo, getVideo, claimStoryboardDraft, deleteVideo } = await import('../db/videos.js')
const versions = await import('../db/video-versions.js')
const files = await import('../db/video-files.js')
const { createOrRefreshVideoShare } = await import('../db/video-shares.js')
const { parseBrief, briefTitle } = await import('../video/brief.js')
const { startStoryboardDraft, cancelStoryboardDraft } = await import('../video/storyboard.js')
const { cancelVideoVersion, wakeVideoRunner } = await import('../video/runner.js')
const { default: videosRouter } = await import('./videos.js')

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'
const BRIEF = { idea: 'Refunds in one click', format: '16:9', durationSeconds: 30 }
const TIMESTAMP = '2026-11-02T10:00:00.000Z'

function videoRow(overrides = {}) {
  return {
    id: VIDEO_ID,
    title: 'Refunds in one click',
    stage: 'storyboard',
    brief: BRIEF,
    storyboard: null,
    storyboardError: null,
    parentVideoId: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    messages: [],
    ...overrides,
  }
}

describe('videos routes', () => {
  let app
  let consoleError

  beforeEach(() => {
    vi.clearAllMocks()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    versions.listVersions.mockResolvedValue([])
    versions.listFrames.mockResolvedValue([])
    versions.listVersionSummaries.mockResolvedValue([])
    versions.listActiveVersionIds.mockResolvedValue([])
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.user = { id: 7 }
      next()
    })
    app.use('/', videosRouter)
  })

  describe('GET /', () => {
    it('returns the summaries of the user videos', async () => {
      listVideoSummaries.mockResolvedValue([videoRow({ stage: 'drafting' })])

      const res = await request(app).get('/')

      expect(res.status).toBe(200)
      expect(res.body.videos).toEqual([
        {
          id: VIDEO_ID,
          title: 'Refunds in one click',
          status: 'drafting',
          phase: null,
          progress: null,
          format: '16:9',
          durationSeconds: 30,
          latestVersion: null,
          thumbnailVersion: null,
          updatedAt: TIMESTAMP,
        },
      ])
      expect(listVideoSummaries).toHaveBeenCalledWith(7)
    })

    it('returns 500 when the DB fails', async () => {
      listVideoSummaries.mockRejectedValue(new Error('boom'))

      const res = await request(app).get('/')

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to load your videos.' })
    })
  })

  describe('POST /', () => {
    it('creates the video, starts drafting its storyboard and returns 201 with the detail', async () => {
      parseBrief.mockResolvedValue({ value: BRIEF })
      briefTitle.mockReturnValue('Refunds in one click')
      createVideo.mockResolvedValue(VIDEO_ID)
      getVideo.mockResolvedValue(videoRow({ stage: 'drafting' }))

      const res = await request(app).post('/').send({ brief: BRIEF })

      expect(res.status).toBe(201)
      expect(res.body.video).toMatchObject({
        id: VIDEO_ID,
        status: 'drafting',
        stage: 'drafting',
        versions: [],
        queuePosition: null,
      })
      expect(parseBrief).toHaveBeenCalledWith(BRIEF, 7)
      expect(createVideo).toHaveBeenCalledWith(7, { title: 'Refunds in one click', brief: BRIEF })
      expect(startStoryboardDraft).toHaveBeenCalledTimes(1)
      expect(startStoryboardDraft).toHaveBeenCalledWith(VIDEO_ID, 7)
    })

    it('returns 400 with the brief error', async () => {
      parseBrief.mockResolvedValue({ error: 'The repo reveni/app is not available.' })

      const res = await request(app).post('/').send({ brief: BRIEF })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'The repo reveni/app is not available.' })
      expect(createVideo).not.toHaveBeenCalled()
      expect(startStoryboardDraft).not.toHaveBeenCalled()
    })

    it('returns 500 when creating fails', async () => {
      parseBrief.mockRejectedValue(new Error('GitHub down'))

      const res = await request(app).post('/').send({ brief: BRIEF })

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to create the video.' })
    })
  })

  describe('GET /:id', () => {
    it('returns the detail of an owned video', async () => {
      const messages = [{ id: 1, role: 'assistant', content: 'Here it is.', version: null, createdAt: TIMESTAMP }]
      getVideo.mockResolvedValue(videoRow({ storyboardError: 'Try again.', messages }))

      const res = await request(app).get(`/${VIDEO_ID}`)

      expect(res.status).toBe(200)
      expect(res.body.video).toEqual({
        id: VIDEO_ID,
        title: 'Refunds in one click',
        status: 'storyboard',
        stage: 'storyboard',
        brief: BRIEF,
        storyboard: null,
        storyboardError: 'Try again.',
        parentVideoId: null,
        messages,
        versions: [],
        queuePosition: null,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      })
      expect(getVideo).toHaveBeenCalledWith(VIDEO_ID, 7)
    })

    it('returns 404 for a video that is missing or owned by someone else', async () => {
      getVideo.mockResolvedValue(null)

      const res = await request(app).get(`/${VIDEO_ID}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Video not found.' })
    })

    it('returns 400 for an invalid id', async () => {
      const res = await request(app).get('/not-a-uuid')

      expect(res.status).toBe(400)
      expect(getVideo).not.toHaveBeenCalled()
    })

    it('returns 500 when the DB fails', async () => {
      getVideo.mockRejectedValue(new Error('boom'))

      const res = await request(app).get(`/${VIDEO_ID}`)

      expect(res.status).toBe(500)
    })
  })

  describe('POST /:id/messages', () => {
    it('stores the request, starts the revision and returns 202', async () => {
      getVideo.mockResolvedValueOnce(videoRow()).mockResolvedValueOnce(videoRow({ stage: 'drafting' }))
      claimStoryboardDraft.mockResolvedValue(true)

      const res = await request(app).post(`/${VIDEO_ID}/messages`).send({ text: '  Shorter intro  ' })

      expect(res.status).toBe(202)
      expect(res.body.video.stage).toBe('drafting')
      expect(claimStoryboardDraft).toHaveBeenCalledWith(VIDEO_ID, 7, { request: 'Shorter intro' })
      expect(startStoryboardDraft).toHaveBeenCalledTimes(1)
      expect(startStoryboardDraft).toHaveBeenCalledWith(VIDEO_ID, 7)
    })

    it('returns 400 for an empty or too long message', async () => {
      const empty = await request(app).post(`/${VIDEO_ID}/messages`).send({ text: '   ' })
      const tooLong = await request(app)
        .post(`/${VIDEO_ID}/messages`)
        .send({ text: 'a'.repeat(4001) })

      expect(empty.status).toBe(400)
      expect(empty.body).toEqual({ error: 'Write a message.' })
      expect(tooLong.status).toBe(400)
      expect(getVideo).not.toHaveBeenCalled()
    })

    it('returns 404 for a video that is missing or not owned', async () => {
      getVideo.mockResolvedValue(null)

      const res = await request(app).post(`/${VIDEO_ID}/messages`).send({ text: 'Shorter intro' })

      expect(res.status).toBe(404)
      expect(claimStoryboardDraft).not.toHaveBeenCalled()
    })

    it('returns 409 while the storyboard is being drafted', async () => {
      getVideo.mockResolvedValue(videoRow({ stage: 'drafting' }))

      const res = await request(app).post(`/${VIDEO_ID}/messages`).send({ text: 'Shorter intro' })

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: 'The storyboard is still being drafted. Wait for it to finish.' })
      expect(startStoryboardDraft).not.toHaveBeenCalled()
    })

    it('returns 409 when another request claimed the draft first', async () => {
      getVideo.mockResolvedValue(videoRow())
      claimStoryboardDraft.mockResolvedValue(false)

      const res = await request(app).post(`/${VIDEO_ID}/messages`).send({ text: 'Shorter intro' })

      expect(res.status).toBe(409)
      expect(startStoryboardDraft).not.toHaveBeenCalled()
    })

    it('returns 500 when the DB fails', async () => {
      getVideo.mockRejectedValue(new Error('boom'))

      const res = await request(app).post(`/${VIDEO_ID}/messages`).send({ text: 'Shorter intro' })

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to send the message.' })
    })
  })

  describe('POST /:id/storyboard', () => {
    it('drafts the storyboard again and returns 202', async () => {
      getVideo
        .mockResolvedValueOnce(videoRow({ storyboardError: 'Try again.' }))
        .mockResolvedValueOnce(videoRow({ stage: 'drafting' }))
      claimStoryboardDraft.mockResolvedValue(true)

      const res = await request(app).post(`/${VIDEO_ID}/storyboard`)

      expect(res.status).toBe(202)
      expect(res.body.video.status).toBe('drafting')
      expect(claimStoryboardDraft).toHaveBeenCalledWith(VIDEO_ID, 7, { request: null })
      expect(startStoryboardDraft).toHaveBeenCalledWith(VIDEO_ID, 7)
    })

    it('returns 409 while drafting and in production', async () => {
      getVideo
        .mockResolvedValueOnce(videoRow({ stage: 'drafting' }))
        .mockResolvedValueOnce(videoRow({ stage: 'production' }))

      const drafting = await request(app).post(`/${VIDEO_ID}/storyboard`)
      const production = await request(app).post(`/${VIDEO_ID}/storyboard`)

      expect(drafting.status).toBe(409)
      expect(production.status).toBe(409)
      expect(production.body).toEqual({
        error: 'The video is already in production: its storyboard cannot be drafted again.',
      })
      expect(claimStoryboardDraft).not.toHaveBeenCalled()
    })

    it('returns 404 for a video that is missing or not owned', async () => {
      getVideo.mockResolvedValue(null)

      const res = await request(app).post(`/${VIDEO_ID}/storyboard`)

      expect(res.status).toBe(404)
    })

    it('returns 500 when the DB fails', async () => {
      getVideo.mockRejectedValue(new Error('boom'))

      const res = await request(app).post(`/${VIDEO_ID}/storyboard`)

      expect(res.status).toBe(500)
    })
  })

  describe('DELETE /:id', () => {
    it('deletes the video, cancels its draft and returns 204', async () => {
      deleteVideo.mockResolvedValue(true)

      const res = await request(app).delete(`/${VIDEO_ID}`)

      expect(res.status).toBe(204)
      expect(deleteVideo).toHaveBeenCalledWith(VIDEO_ID, 7)
      expect(cancelStoryboardDraft).toHaveBeenCalledTimes(1)
      expect(cancelStoryboardDraft).toHaveBeenCalledWith(VIDEO_ID)
    })

    it('cancels the versions that were queued or running', async () => {
      versions.listActiveVersionIds.mockResolvedValue([41, 42])
      deleteVideo.mockResolvedValue(true)

      const res = await request(app).delete(`/${VIDEO_ID}`)

      expect(res.status).toBe(204)
      expect(versions.listActiveVersionIds).toHaveBeenCalledWith(VIDEO_ID, 7)
      expect(cancelVideoVersion).toHaveBeenCalledTimes(2)
      expect(cancelVideoVersion.mock.calls.map(([id]) => id)).toEqual([41, 42])
    })

    it('returns 404 for a video that is missing or not owned', async () => {
      deleteVideo.mockResolvedValue(false)

      const res = await request(app).delete(`/${VIDEO_ID}`)

      expect(res.status).toBe(404)
      expect(cancelStoryboardDraft).not.toHaveBeenCalled()
    })

    it('returns 500 when the DB fails', async () => {
      deleteVideo.mockRejectedValue(new Error('boom'))

      const res = await request(app).delete(`/${VIDEO_ID}`)

      expect(res.status).toBe(500)
      expect(consoleError).toHaveBeenCalledTimes(1)
    })
  })

  describe('production state in the list and the detail', () => {
    it('fills status, phase, progress, latest version and thumbnail version from the versions', async () => {
      listVideoSummaries.mockResolvedValue([
        videoRow({ stage: 'production' }),
        videoRow({ id: 'other', stage: 'drafting' }),
      ])
      versions.listVersionSummaries.mockResolvedValue([
        { videoId: VIDEO_ID, version: 2, status: 'running', phase: 'rendering', progress: 40, hasThumbnail: false },
        { videoId: VIDEO_ID, version: 1, status: 'ready', phase: null, progress: 100, hasThumbnail: true },
      ])

      const res = await request(app).get('/')

      expect(versions.listVersionSummaries).toHaveBeenCalledWith([VIDEO_ID, 'other'])
      expect(res.body.videos[0]).toMatchObject({
        status: 'running',
        phase: 'rendering',
        progress: 40,
        latestVersion: 2,
        thumbnailVersion: 1,
      })
      expect(res.body.videos[1]).toMatchObject({ status: 'drafting', latestVersion: null })
    })

    it('adds the versions, their frames and the queue position to the detail', async () => {
      getVideo.mockResolvedValue(videoRow({ stage: 'production' }))
      versions.listVersions.mockResolvedValue([
        { id: 41, version: 1, status: 'queued', events: [], hasVideo: false, previewReady: false },
      ])
      versions.listFrames.mockResolvedValue([{ id: 3, versionId: 41, times: [1, 2], createdAt: TIMESTAMP }])
      versions.getQueuePosition.mockResolvedValue(2)

      const res = await request(app).get(`/${VIDEO_ID}`)

      expect(versions.listFrames).toHaveBeenCalledWith([41])
      expect(versions.getQueuePosition).toHaveBeenCalledWith(41)
      expect(res.body.video.status).toBe('queued')
      expect(res.body.video.queuePosition).toBe(2)
      expect(res.body.video.versions[0]).toMatchObject({
        version: 1,
        status: 'queued',
        frames: [{ id: 3, times: [1, 2], createdAt: TIMESTAMP }],
      })
    })

    it('has no queue position when the latest version is not queued', async () => {
      getVideo.mockResolvedValue(videoRow({ stage: 'production' }))
      versions.listVersions.mockResolvedValue([{ id: 41, version: 1, status: 'running', events: [] }])

      const res = await request(app).get(`/${VIDEO_ID}`)

      expect(res.body.video.queuePosition).toBeNull()
      expect(versions.getQueuePosition).not.toHaveBeenCalled()
    })
  })

  describe('POST /:id/messages in production', () => {
    it('creates the next version from the change request, cancels the render it replaces and wakes the runner', async () => {
      getVideo.mockResolvedValue(videoRow({ stage: 'production' }))
      versions.createChangeRequest.mockResolvedValue({ status: 'ok', version: 3, cancelledVersionId: 41 })

      const res = await request(app).post(`/${VIDEO_ID}/messages`).send({ text: ' Make the title orange. ' })

      expect(res.status).toBe(202)
      expect(versions.createChangeRequest).toHaveBeenCalledWith(VIDEO_ID, 7, 'Make the title orange.')
      expect(cancelVideoVersion).toHaveBeenCalledWith(41)
      expect(wakeVideoRunner).toHaveBeenCalledTimes(1)
      expect(claimStoryboardDraft).not.toHaveBeenCalled()
    })

    it('does not cancel anything when nothing was rendering', async () => {
      getVideo.mockResolvedValue(videoRow({ stage: 'production' }))
      versions.createChangeRequest.mockResolvedValue({ status: 'ok', version: 2, cancelledVersionId: null })

      await request(app).post(`/${VIDEO_ID}/messages`).send({ text: 'Orange.' })

      expect(cancelVideoVersion).not.toHaveBeenCalled()
    })

    it.each([
      ['busy', 409, 'The latest version is still being composed. Wait for it to finish or cancel it first.'],
      ['conflict', 409, 'The storyboard is still being drafted. Wait for it to finish.'],
      ['not_found', 404, 'Video not found.'],
    ])('answers %s with %i', async (status, code, error) => {
      getVideo.mockResolvedValue(videoRow({ stage: 'production' }))
      versions.createChangeRequest.mockResolvedValue({ status })

      const res = await request(app).post(`/${VIDEO_ID}/messages`).send({ text: 'Orange.' })

      expect(res.status).toBe(code)
      expect(res.body).toEqual({ error })
      expect(wakeVideoRunner).not.toHaveBeenCalled()
    })
  })

  describe('POST /:id/generate', () => {
    it('starts production with version 1 and wakes the runner', async () => {
      versions.startProduction.mockResolvedValue(true)
      getVideo.mockResolvedValue(videoRow({ stage: 'production' }))
      versions.listVersions.mockResolvedValue([{ id: 41, version: 1, status: 'queued', events: [] }])
      versions.getQueuePosition.mockResolvedValue(1)

      const res = await request(app).post(`/${VIDEO_ID}/generate`)

      expect(res.status).toBe(202)
      expect(versions.startProduction).toHaveBeenCalledWith(VIDEO_ID, 7)
      expect(wakeVideoRunner).toHaveBeenCalledTimes(1)
      expect(res.body.video).toMatchObject({ stage: 'production', status: 'queued', queuePosition: 1 })
    })

    it('returns 409 without an approved storyboard, and 404 for a missing video', async () => {
      versions.startProduction.mockResolvedValue(false)
      getVideo.mockResolvedValueOnce(videoRow({ stage: 'drafting' })).mockResolvedValueOnce(null)

      const conflict = await request(app).post(`/${VIDEO_ID}/generate`)
      const missing = await request(app).post(`/${VIDEO_ID}/generate`)

      expect(conflict.status).toBe(409)
      expect(missing.status).toBe(404)
      expect(wakeVideoRunner).not.toHaveBeenCalled()
    })

    it('returns 500 when the DB fails', async () => {
      versions.startProduction.mockRejectedValue(new Error('boom'))

      expect((await request(app).post(`/${VIDEO_ID}/generate`)).status).toBe(500)
    })
  })

  describe('POST /:id/cancel', () => {
    it('cancels the latest version and returns 200 with the detail', async () => {
      versions.cancelLatestVersion.mockResolvedValue({ status: 'cancelling', versionId: 41 })
      getVideo.mockResolvedValue(videoRow({ stage: 'production' }))

      const res = await request(app).post(`/${VIDEO_ID}/cancel`)

      expect(res.status).toBe(200)
      expect(versions.cancelLatestVersion).toHaveBeenCalledWith(VIDEO_ID, 7)
      expect(cancelVideoVersion).toHaveBeenCalledWith(41)
      expect(res.body.video.id).toBe(VIDEO_ID)
    })

    it('returns 409 when nothing is queued or running, and 404 for a missing video', async () => {
      versions.cancelLatestVersion
        .mockResolvedValueOnce({ status: 'idle' })
        .mockResolvedValueOnce({ status: 'not_found' })

      const idle = await request(app).post(`/${VIDEO_ID}/cancel`)
      const missing = await request(app).post(`/${VIDEO_ID}/cancel`)

      expect(idle.status).toBe(409)
      expect(idle.body).toEqual({ error: 'No version is queued or running.' })
      expect(missing.status).toBe(404)
      expect(cancelVideoVersion).not.toHaveBeenCalled()
    })

    it('returns 500 when the DB fails', async () => {
      versions.cancelLatestVersion.mockRejectedValue(new Error('boom'))

      expect((await request(app).post(`/${VIDEO_ID}/cancel`)).status).toBe(500)
    })
  })

  describe('POST /:id/versions/:version/retry and /render', () => {
    it.each(['retry', 'render'])('re-queues the version for %s and wakes the runner', async mode => {
      versions.requeueVersion.mockResolvedValue('ok')
      getVideo.mockResolvedValue(videoRow({ stage: 'production' }))

      const res = await request(app).post(`/${VIDEO_ID}/versions/2/${mode}`)

      expect(res.status).toBe(202)
      expect(versions.requeueVersion).toHaveBeenCalledWith({ videoId: VIDEO_ID, userId: 7, version: 2, mode })
      expect(wakeVideoRunner).toHaveBeenCalledTimes(1)
    })

    it('returns 409 for a version in the wrong state and 404 for a missing one', async () => {
      versions.requeueVersion.mockResolvedValueOnce('conflict').mockResolvedValueOnce('not_found')

      const conflict = await request(app).post(`/${VIDEO_ID}/versions/2/retry`)
      const missing = await request(app).post(`/${VIDEO_ID}/versions/9/render`)

      expect(conflict.status).toBe(409)
      expect(conflict.body).toEqual({ error: 'Only a failed or cancelled version can be retried.' })
      expect(missing.status).toBe(404)
      expect(missing.body).toEqual({ error: 'Version not found.' })
    })

    it('returns 400 for an invalid version and 500 when the DB fails', async () => {
      versions.requeueVersion.mockRejectedValue(new Error('boom'))

      const invalid = await request(app).post(`/${VIDEO_ID}/versions/0/retry`)
      const retry = await request(app).post(`/${VIDEO_ID}/versions/2/retry`)
      const render = await request(app).post(`/${VIDEO_ID}/versions/2/render`)

      expect(invalid.status).toBe(400)
      expect(invalid.body).toEqual({ error: 'Invalid version.' })
      expect(retry.status).toBe(500)
      expect(render.status).toBe(500)
    })
  })

  describe('GET /:id/versions/:version/preview', () => {
    it('returns the preview bundle of a version whose preview is ready', async () => {
      versions.getOwnedVersion.mockResolvedValue({ id: 41, previewReady: true })
      files.readProjectFiles.mockResolvedValue(exampleProjectFixture.files)
      files.loadVideoAssets.mockResolvedValue(exampleProjectFixture.assets)

      const res = await request(app).get(`/${VIDEO_ID}/versions/1/preview`)

      expect(res.status).toBe(200)
      expect(versions.getOwnedVersion).toHaveBeenCalledWith({ videoId: VIDEO_ID, userId: 7, version: 1 })
      expect(files.readProjectFiles).toHaveBeenCalledWith(41)
      expect(files.loadVideoAssets).toHaveBeenCalledWith(VIDEO_ID)
      expect(res.body.html).toContain('window.__MODE__ = "preview"')
    })

    it('returns 409 until the preview is ready and 404 for a missing version', async () => {
      versions.getOwnedVersion.mockResolvedValueOnce({ id: 41, previewReady: false }).mockResolvedValueOnce(null)

      const early = await request(app).get(`/${VIDEO_ID}/versions/1/preview`)
      const missing = await request(app).get(`/${VIDEO_ID}/versions/9/preview`)

      expect(early.status).toBe(409)
      expect(missing.status).toBe(404)
      expect(files.readProjectFiles).not.toHaveBeenCalled()
    })

    it('returns 422 when the stored files no longer bundle and 500 when the DB fails', async () => {
      versions.getOwnedVersion.mockResolvedValue({ id: 41, previewReady: true })
      files.readProjectFiles.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('boom'))
      files.loadVideoAssets.mockResolvedValue({})

      const broken = await request(app).get(`/${VIDEO_ID}/versions/1/preview`)
      const failing = await request(app).get(`/${VIDEO_ID}/versions/1/preview`)

      expect(broken.status).toBe(422)
      expect(broken.body.error).toContain('project.json is missing')
      expect(failing.status).toBe(500)
    })
  })

  describe('GET /:id/versions/:version/video', () => {
    const MP4 = Buffer.from('0123456789')

    it('downloads the MP4 as an attachment named after the title', async () => {
      versions.getVersionMedia.mockResolvedValue({ title: 'Refunds: one click', data: MP4 })

      const res = await request(app).get(`/${VIDEO_ID}/versions/2/video`).buffer(true)

      expect(res.status).toBe(200)
      expect(versions.getVersionMedia).toHaveBeenCalledWith({ videoId: VIDEO_ID, userId: 7, version: 2, kind: 'video' })
      expect(res.headers['content-type']).toBe('video/mp4')
      expect(res.headers['content-disposition']).toBe('attachment; filename="Refunds one click v2.mp4"')
      expect(res.headers['accept-ranges']).toBe('bytes')
      expect(Buffer.from(res.body).equals(MP4)).toBe(true)
    })

    it('serves byte ranges', async () => {
      versions.getVersionMedia.mockResolvedValue({ title: 'Refunds', data: MP4 })

      const head = await request(app).get(`/${VIDEO_ID}/versions/2/video`).set('Range', 'bytes=0-3').buffer(true)
      const open = await request(app).get(`/${VIDEO_ID}/versions/2/video`).set('Range', 'bytes=6-').buffer(true)
      const suffix = await request(app).get(`/${VIDEO_ID}/versions/2/video`).set('Range', 'bytes=-2').buffer(true)
      const outside = await request(app).get(`/${VIDEO_ID}/versions/2/video`).set('Range', 'bytes=20-30')
      const emptySuffix = await request(app).get(`/${VIDEO_ID}/versions/2/video`).set('Range', 'bytes=-0')
      const ignored = await request(app).get(`/${VIDEO_ID}/versions/2/video`).set('Range', 'bytes=-').buffer(true)

      expect(head.status).toBe(206)
      expect(head.headers['content-range']).toBe('bytes 0-3/10')
      expect(Buffer.from(head.body).toString()).toBe('0123')
      expect(Buffer.from(open.body).toString()).toBe('6789')
      expect(suffix.headers['content-range']).toBe('bytes 8-9/10')
      expect(outside.status).toBe(416)
      expect(outside.headers['content-range']).toBe('bytes */10')
      expect(emptySuffix.status).toBe(416)
      expect(ignored.status).toBe(200)
    })

    it('returns 404 when the version has no MP4 and 500 when the DB fails', async () => {
      versions.getVersionMedia.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('boom'))

      expect((await request(app).get(`/${VIDEO_ID}/versions/2/video`)).status).toBe(404)
      expect((await request(app).get(`/${VIDEO_ID}/versions/2/video`)).status).toBe(500)
    })

    it('falls back to a generic name when the title has nothing usable', async () => {
      versions.getVersionMedia.mockResolvedValue({ title: '///', data: MP4 })

      const res = await request(app).get(`/${VIDEO_ID}/versions/1/video`)

      expect(res.headers['content-disposition']).toBe('attachment; filename="video v1.mp4"')
    })
  })

  describe('GET /:id/versions/:version/thumbnail and /:id/frames/:frameId', () => {
    it('serves the thumbnail as a JPEG', async () => {
      versions.getVersionMedia.mockResolvedValue({ title: 'Refunds', data: Buffer.from('jpg') })

      const res = await request(app).get(`/${VIDEO_ID}/versions/1/thumbnail`)

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('image/jpeg')
      expect(versions.getVersionMedia).toHaveBeenCalledWith({
        videoId: VIDEO_ID,
        userId: 7,
        version: 1,
        kind: 'thumbnail',
      })
    })

    it('serves a frame contact sheet as a PNG', async () => {
      files.getFrameImage.mockResolvedValue(Buffer.from('png'))

      const res = await request(app).get(`/${VIDEO_ID}/frames/17`)

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('image/png')
      expect(files.getFrameImage).toHaveBeenCalledWith(VIDEO_ID, 7, 17)
    })

    it('answers 404, 400 and 500 for missing, invalid and failing reads', async () => {
      versions.getVersionMedia.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('boom'))
      files.getFrameImage.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('boom'))

      expect((await request(app).get(`/${VIDEO_ID}/versions/1/thumbnail`)).status).toBe(404)
      expect((await request(app).get(`/${VIDEO_ID}/versions/1/thumbnail`)).status).toBe(500)
      expect((await request(app).get(`/${VIDEO_ID}/frames/17`)).status).toBe(404)
      expect((await request(app).get(`/${VIDEO_ID}/frames/17`)).status).toBe(500)
      expect((await request(app).get(`/${VIDEO_ID}/frames/abc`)).status).toBe(400)
    })
  })

  describe('POST /:id/versions/:version/share', () => {
    it('returns the public URL of the MP4', async () => {
      versions.getOwnedVersion.mockResolvedValue({ id: 41, previewReady: true })
      createOrRefreshVideoShare.mockResolvedValue('a'.repeat(32))

      const res = await request(app).post(`/${VIDEO_ID}/versions/2/share`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ url: `/api/share/videos/${'a'.repeat(32)}` })
      expect(createOrRefreshVideoShare).toHaveBeenCalledWith({ videoId: VIDEO_ID, userId: 7, version: 2 })
    })

    it('returns 409 without an MP4, 404 for a missing version and 500 when the DB fails', async () => {
      versions.getOwnedVersion
        .mockResolvedValueOnce({ id: 41 })
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('boom'))
      createOrRefreshVideoShare.mockResolvedValue(null)

      expect((await request(app).post(`/${VIDEO_ID}/versions/2/share`)).status).toBe(409)
      expect((await request(app).post(`/${VIDEO_ID}/versions/9/share`)).status).toBe(404)
      expect((await request(app).post(`/${VIDEO_ID}/versions/2/share`)).status).toBe(500)
    })
  })

  describe('POST /:id/variants', () => {
    it('creates a sibling video from the request and returns 201 with its detail', async () => {
      const variantId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
      versions.createVariant.mockResolvedValue({ status: 'ok', id: variantId })
      getVideo.mockResolvedValue(videoRow({ id: variantId, stage: 'production', parentVideoId: VIDEO_ID }))

      const res = await request(app).post(`/${VIDEO_ID}/variants`).send({ request: ' Brand it for Lounge. ' })

      expect(res.status).toBe(201)
      expect(versions.createVariant).toHaveBeenCalledWith(VIDEO_ID, 7, 'Brand it for Lounge.')
      expect(getVideo).toHaveBeenCalledWith(variantId, 7)
      expect(res.body.video).toMatchObject({ id: variantId, parentVideoId: VIDEO_ID })
      expect(wakeVideoRunner).toHaveBeenCalledTimes(1)
    })

    it('validates the request', async () => {
      const res = await request(app).post(`/${VIDEO_ID}/variants`).send({ request: '' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Write a request.' })
      expect(versions.createVariant).not.toHaveBeenCalled()
    })

    it('returns 409 without a previewed version, 404 for a missing video and 500 when the DB fails', async () => {
      versions.createVariant
        .mockResolvedValueOnce({ status: 'conflict' })
        .mockResolvedValueOnce({ status: 'not_found' })
        .mockRejectedValueOnce(new Error('boom'))

      expect((await request(app).post(`/${VIDEO_ID}/variants`).send({ request: 'x' })).status).toBe(409)
      expect((await request(app).post(`/${VIDEO_ID}/variants`).send({ request: 'x' })).status).toBe(404)
      expect((await request(app).post(`/${VIDEO_ID}/variants`).send({ request: 'x' })).status).toBe(500)
    })
  })
})
