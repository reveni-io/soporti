import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../db/schedules.js', () => ({
  listSchedules: vi.fn(),
  countSchedules: vi.fn(),
  createSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
}))

const { listSchedules, countSchedules, createSchedule, deleteSchedule } = await import('../db/schedules.js')
const { default: schedulesRouter } = await import('./schedules.js')

const DAILY_BODY = {
  question: 'Failed payments in the last 24h',
  sources: ['yolo'],
  profile: 'support',
  frequency: 'daily',
  minute: 0,
  hour: 9,
  timezone: 'Europe/Madrid',
}

describe('schedules routes', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    countSchedules.mockResolvedValue(0)
    createSchedule.mockImplementation(async (userId, schedule) => ({ id: 1, ...schedule }))
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.user = { id: 1 }
      next()
    })
    app.use('/', schedulesRouter)
  })

  describe('GET /', () => {
    it('returns the schedules of the user', async () => {
      listSchedules.mockResolvedValue([{ id: 1, question: 'Failed payments' }])

      const res = await request(app).get('/')

      expect(res.status).toBe(200)
      expect(res.body.schedules).toHaveLength(1)
      expect(listSchedules).toHaveBeenCalledWith(1)
    })

    it('returns 500 when the DB fails', async () => {
      listSchedules.mockRejectedValue(new Error('boom'))

      const res = await request(app).get('/')

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to list the scheduled queries.')
    })
  })

  describe('POST /', () => {
    it('creates a daily schedule and computes its next run', async () => {
      const res = await request(app).post('/').send(DAILY_BODY)

      expect(res.status).toBe(201)
      const [userId, schedule] = createSchedule.mock.calls[0]
      expect(userId).toBe(1)
      expect(schedule).toMatchObject({
        question: 'Failed payments in the last 24h',
        sources: ['yolo'],
        profile: 'support',
        frequency: 'daily',
        minute: 0,
        hour: 9,
        weekday: null,
        monthDay: null,
        timezone: 'Europe/Madrid',
      })
      expect(schedule.nextRunAt.getTime()).toBeGreaterThan(Date.now())
    })

    it('trims the question', async () => {
      await request(app)
        .post('/')
        .send({ ...DAILY_BODY, question: '  Failed payments  ' })

      expect(createSchedule.mock.calls[0][1].question).toBe('Failed payments')
    })

    it('stores an hourly schedule without an hour', async () => {
      const res = await request(app)
        .post('/')
        .send({ ...DAILY_BODY, frequency: 'hourly', minute: 30, hour: undefined })

      expect(res.status).toBe(201)
      expect(createSchedule.mock.calls[0][1]).toMatchObject({ frequency: 'hourly', minute: 30, hour: null })
    })

    it('requires a weekday for a weekly schedule', async () => {
      const res = await request(app)
        .post('/')
        .send({ ...DAILY_BODY, frequency: 'weekly' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/weekday/i)
      expect(createSchedule).not.toHaveBeenCalled()
    })

    it('requires a day of the month for a monthly schedule', async () => {
      const res = await request(app)
        .post('/')
        .send({ ...DAILY_BODY, frequency: 'monthly', monthDay: 31 })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/between 1 and 28/i)
    })

    it('rejects an empty question', async () => {
      const res = await request(app)
        .post('/')
        .send({ ...DAILY_BODY, question: '   ' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('A question is required.')
    })

    it('rejects a question over the length limit', async () => {
      const res = await request(app)
        .post('/')
        .send({ ...DAILY_BODY, question: 'x'.repeat(10_001) })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/too long/i)
    })

    it('rejects sources that are not a list of names', async () => {
      const res = await request(app)
        .post('/')
        .send({ ...DAILY_BODY, sources: 'yolo' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/sources/i)
    })

    it('rejects an unknown profile', async () => {
      const res = await request(app)
        .post('/')
        .send({ ...DAILY_BODY, profile: 'wizard' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/profile/i)
    })

    it('rejects an unknown frequency', async () => {
      const res = await request(app)
        .post('/')
        .send({ ...DAILY_BODY, frequency: 'every-minute' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/frequency/i)
    })

    it('rejects a minute outside 0-59', async () => {
      const res = await request(app)
        .post('/')
        .send({ ...DAILY_BODY, minute: 60 })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/minute/i)
    })

    it('rejects an hour outside 0-23', async () => {
      const res = await request(app)
        .post('/')
        .send({ ...DAILY_BODY, hour: 24 })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/hour/i)
    })

    it('rejects an invalid time zone', async () => {
      const res = await request(app)
        .post('/')
        .send({ ...DAILY_BODY, timezone: 'Mars/Olympus' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/time zone/i)
    })

    it('refuses to create more schedules than the limit allows', async () => {
      countSchedules.mockResolvedValue(20)

      const res = await request(app).post('/').send(DAILY_BODY)

      expect(res.status).toBe(422)
      expect(res.body.error).toMatch(/20 scheduled queries/)
      expect(createSchedule).not.toHaveBeenCalled()
    })

    it('returns 500 when the DB fails', async () => {
      createSchedule.mockRejectedValue(new Error('boom'))

      const res = await request(app).post('/').send(DAILY_BODY)

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to create the scheduled query.')
    })
  })

  describe('DELETE /:id', () => {
    it('rejects a non-numeric id', async () => {
      const res = await request(app).delete('/nope')

      expect(res.status).toBe(400)
      expect(deleteSchedule).not.toHaveBeenCalled()
    })

    it('deletes the schedule of the user', async () => {
      deleteSchedule.mockResolvedValue(true)

      const res = await request(app).delete('/3')

      expect(res.status).toBe(200)
      expect(deleteSchedule).toHaveBeenCalledWith(3, 1)
    })

    it('returns 404 when the schedule does not exist or is not owned', async () => {
      deleteSchedule.mockResolvedValue(false)

      const res = await request(app).delete('/3')

      expect(res.status).toBe(404)
    })

    it('returns 500 when the DB fails', async () => {
      deleteSchedule.mockRejectedValue(new Error('boom'))

      const res = await request(app).delete('/3')

      expect(res.status).toBe(500)
    })
  })
})
