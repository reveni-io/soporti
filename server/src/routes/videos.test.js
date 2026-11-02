import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../db/videos.js', () => ({
  listVideoSummaries: vi.fn(),
  createVideo: vi.fn(),
  getVideo: vi.fn(),
  claimStoryboardDraft: vi.fn(),
  deleteVideo: vi.fn(),
}))
vi.mock('../video/brief.js', () => ({ parseBrief: vi.fn(), briefTitle: vi.fn() }))
vi.mock('../video/storyboard.js', () => ({ startStoryboardDraft: vi.fn(), cancelStoryboardDraft: vi.fn() }))

const { listVideoSummaries, createVideo, getVideo, claimStoryboardDraft, deleteVideo } = await import('../db/videos.js')
const { parseBrief, briefTitle } = await import('../video/brief.js')
const { startStoryboardDraft, cancelStoryboardDraft } = await import('../video/storyboard.js')
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

    it('returns 409 in production until change requests exist', async () => {
      getVideo.mockResolvedValue(videoRow({ stage: 'production' }))

      const res = await request(app).post(`/${VIDEO_ID}/messages`).send({ text: 'Shorter intro' })

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: 'Change requests arrive with video generation.' })
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
})
