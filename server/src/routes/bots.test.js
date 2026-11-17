import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../db/bots.js', () => ({
  countBots: vi.fn(),
  createBot: vi.fn(),
  deleteBot: vi.fn(),
  getBot: vi.fn(),
  listBots: vi.fn(),
  markBotRead: vi.fn(),
  updateBot: vi.fn(),
}))
vi.mock('../db/routines.js', () => ({
  deleteRoutine: vi.fn(),
  getRoutine: vi.fn(),
  listRoutines: vi.fn(),
  setRoutinePaused: vi.fn(),
}))
vi.mock('../bots/greeting.js', () => ({ generateGreeting: vi.fn() }))

const { countBots, createBot, deleteBot, getBot, listBots, markBotRead, updateBot } = await import('../db/bots.js')
const { deleteRoutine, getRoutine, listRoutines, setRoutinePaused } = await import('../db/routines.js')
const { generateGreeting } = await import('../bots/greeting.js')
const { default: botsRoute } = await import('./bots.js')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const BOT_BODY = { name: 'Ticket triager', description: 'Triage the new Zendesk tickets.', profile: 'tech' }
const BOT = { id: 4, ...BOT_BODY, avatarSeed: 'seed-1', unreadCount: 0, createdAt: '2026-11-17T10:00:00.000Z' }
const SESSION = { id: 'bot-session' }
const ROUTINE = {
  id: 9,
  title: 'Ticket triage',
  instruction: 'Review the new tickets.',
  frequency: 'daily',
  minute: 0,
  hour: 17,
  weekday: null,
  monthDay: null,
  runDate: null,
  timezone: 'Europe/Madrid',
  paused: true,
  nextRunAt: new Date('2026-11-10T16:00:00Z'),
  lastRunAt: null,
  lastStatus: null,
}

const store = {
  resolveBot: vi.fn(),
  saveTurn: vi.fn(),
  getBotMessages: vi.fn(),
}

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  req.user = { id: 7 }
  next()
})
app.use('/', botsRoute(store))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  countBots.mockResolvedValue(0)
  createBot.mockImplementation(async (_userId, bot) => ({ ...BOT, ...bot }))
  getBot.mockResolvedValue(BOT)
  generateGreeting.mockResolvedValue('Hi! I am Ticket triager.')
  store.resolveBot.mockResolvedValue({ conversationId: 'bot-conversation', session: SESSION })
  store.saveTurn.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('bots routes', () => {
  describe('GET /', () => {
    it('lists the bots of the user', async () => {
      listBots.mockResolvedValue([BOT])

      const res = await request(app).get('/')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ bots: [BOT] })
      expect(listBots).toHaveBeenCalledWith(7)
    })

    it('returns 500 when the bots cannot be listed', async () => {
      listBots.mockRejectedValue(new Error('db down'))

      const res = await request(app).get('/')

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to list the bots.' })
    })
  })

  describe('POST /', () => {
    it('creates the bot with a fresh avatar and stores its greeting before answering', async () => {
      const res = await request(app).post('/').send(BOT_BODY)

      expect(res.status).toBe(201)
      expect(res.body.bot).toMatchObject({ id: 4, name: 'Ticket triager', profile: 'tech' })
      const [userId, input] = createBot.mock.calls[0]
      expect(userId).toBe(7)
      expect(input).toMatchObject(BOT_BODY)
      expect(input.avatarSeed).toMatch(UUID_RE)
      expect(store.resolveBot).toHaveBeenCalledWith(4, 7)
      expect(generateGreeting).toHaveBeenCalledWith(expect.objectContaining({ id: 4, name: 'Ticket triager' }))
      expect(store.saveTurn).toHaveBeenCalledTimes(1)
      expect(store.saveTurn).toHaveBeenCalledWith('bot-conversation', {
        lastResponseId: null,
        session: SESSION,
        unpersistedItems: [
          { type: 'message', role: 'user', content: '(You were just created. Introduce yourself.)' },
          {
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'Hi! I am Ticket triager.' }],
          },
        ],
        uiMessages: [{ role: 'assistant', parts: [{ type: 'text', content: 'Hi! I am Ticket triager.' }] }],
      })
    })

    it('keeps the avatar the user picked and trims the texts', async () => {
      await request(app)
        .post('/')
        .send({
          name: '  Triager  ',
          description: '  Triage tickets.  ',
          profile: 'support',
          avatarSeed: 'Abc-123',
          avatarStyle: { shape: 'cloud', hue: 195, tone: 'deep', mood: 'happy' },
        })

      expect(createBot.mock.calls[0][1]).toEqual({
        name: 'Triager',
        description: 'Triage tickets.',
        profile: 'support',
        avatarSeed: 'Abc-123',
        avatarStyle: { shape: 'cloud', hue: 195, tone: 'deep', mood: 'happy' },
      })
    })

    it('creates the bot without a pinned avatar style when none is sent', async () => {
      await request(app).post('/').send(BOT_BODY)

      expect(createBot.mock.calls[0][1].avatarStyle).toBeNull()
    })

    it.each([
      [{ name: '  ' }, 'The name is required.'],
      [{ name: 'x'.repeat(51) }, 'The name is too long (max 50 characters).'],
      [{ description: '' }, 'The description is required.'],
      [{ description: 'x'.repeat(1001) }, 'The description is too long (max 1000 characters).'],
      [{ profile: 'sales' }, 'Profile must be one of: tech, support.'],
      [{ profile: undefined }, 'Profile must be one of: tech, support.'],
      [{ avatarSeed: 'not a seed!' }, 'The avatar seed must be 1 to 64 letters, digits or hyphens.'],
      [{ avatarSeed: 'x'.repeat(65) }, 'The avatar seed must be 1 to 64 letters, digits or hyphens.'],
      [{ avatarSeed: 42 }, 'The avatar seed must be 1 to 64 letters, digits or hyphens.'],
      [{ avatarStyle: { shape: 'star' } }, expect.stringMatching(/^The avatar shape must be one of: round, /)],
      [{ avatarStyle: { hue: 360 } }, 'The avatar hue must be a whole number from 0 to 359.'],
    ])('rejects %o', async (override, error) => {
      const res = await request(app)
        .post('/')
        .send({ ...BOT_BODY, ...override })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error })
      expect(createBot).not.toHaveBeenCalled()
    })

    it('refuses an eleventh bot', async () => {
      countBots.mockResolvedValue(10)

      const res = await request(app).post('/').send(BOT_BODY)

      expect(res.status).toBe(422)
      expect(res.body).toEqual({ error: 'You can only have 10 bots.' })
      expect(countBots).toHaveBeenCalledWith(7)
      expect(createBot).not.toHaveBeenCalled()
    })

    it('still creates the bot when its greeting cannot be stored', async () => {
      store.saveTurn.mockRejectedValue(new Error('db down'))

      const res = await request(app).post('/').send(BOT_BODY)

      expect(res.status).toBe(201)
      expect(res.body.bot).toMatchObject({ id: 4, name: 'Ticket triager' })
      expect(store.saveTurn).toHaveBeenCalledTimes(1)
      expect(console.error).toHaveBeenCalledWith('Failed to store the greeting of a new bot:', expect.any(Error))
    })

    it('returns 500 when the bot cannot be created', async () => {
      createBot.mockRejectedValue(new Error('db down'))

      const res = await request(app).post('/').send(BOT_BODY)

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to create the bot.' })
    })
  })

  describe('PUT /:id', () => {
    it('updates the bot and keeps its avatar when none is sent', async () => {
      updateBot.mockResolvedValue({ ...BOT, name: 'Triager' })

      const res = await request(app)
        .put('/4')
        .send({ ...BOT_BODY, name: 'Triager' })

      expect(res.status).toBe(200)
      expect(res.body.bot.name).toBe('Triager')
      expect(updateBot).toHaveBeenCalledWith(4, 7, {
        name: 'Triager',
        description: 'Triage the new Zendesk tickets.',
        profile: 'tech',
        avatarSeed: null,
        avatarStyle: null,
      })
    })

    it('updates the avatar style the user picked', async () => {
      updateBot.mockResolvedValue({ ...BOT, avatarStyle: { shape: 'sun', mood: 'wink' } })

      const res = await request(app)
        .put('/4')
        .send({ ...BOT_BODY, avatarStyle: { shape: 'sun', mood: 'wink' } })

      expect(res.status).toBe(200)
      expect(res.body.bot.avatarStyle).toEqual({ shape: 'sun', mood: 'wink' })
      expect(updateBot).toHaveBeenCalledTimes(1)
      expect(updateBot.mock.calls[0][2].avatarStyle).toEqual({ shape: 'sun', mood: 'wink' })
    })

    it('returns 404 when the bot is not the user own', async () => {
      updateBot.mockResolvedValue(null)

      const res = await request(app).put('/4').send(BOT_BODY)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Bot not found.' })
    })

    it('rejects an invalid id or body', async () => {
      const badId = await request(app).put('/abc').send(BOT_BODY)
      const badBody = await request(app)
        .put('/4')
        .send({ ...BOT_BODY, name: '' })

      expect(badId.status).toBe(400)
      expect(badId.body).toEqual({ error: 'Invalid bot ID.' })
      expect(badBody.status).toBe(400)
      expect(updateBot).not.toHaveBeenCalled()
    })

    it('returns 500 when the bot cannot be updated', async () => {
      updateBot.mockRejectedValue(new Error('db down'))

      const res = await request(app).put('/4').send(BOT_BODY)

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to update the bot.' })
    })
  })

  describe('DELETE /:id', () => {
    it('deletes the bot', async () => {
      deleteBot.mockResolvedValue(true)

      const res = await request(app).delete('/4')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(deleteBot).toHaveBeenCalledWith(4, 7)
    })

    it('returns 404 for a bot that is not the user own and 400 for a malformed id', async () => {
      deleteBot.mockResolvedValue(false)

      expect((await request(app).delete('/4')).status).toBe(404)
      expect((await request(app).delete('/1234567890')).status).toBe(400)
    })

    it('returns 500 when the bot cannot be deleted', async () => {
      deleteBot.mockRejectedValue(new Error('db down'))

      const res = await request(app).delete('/4')

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to delete the bot.' })
    })
  })

  describe('GET /:id/messages', () => {
    it('returns the messages of the bot chat', async () => {
      const messages = [{ role: 'assistant', parts: [{ type: 'text', content: 'Hi!' }] }]
      store.getBotMessages.mockResolvedValue(messages)

      const res = await request(app).get('/4/messages')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ messages })
      expect(getBot).toHaveBeenCalledWith(4, 7)
      expect(store.getBotMessages).toHaveBeenCalledWith(4, 7)
    })

    it('returns 404 for a bot that is not the user own', async () => {
      getBot.mockResolvedValue(null)

      const res = await request(app).get('/4/messages')

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Bot not found.' })
      expect(store.getBotMessages).not.toHaveBeenCalled()
    })

    it('returns 500 when the bot or its messages cannot be loaded', async () => {
      getBot.mockRejectedValueOnce(new Error('db down'))
      const botFailure = await request(app).get('/4/messages')
      store.getBotMessages.mockRejectedValue(new Error('db down'))
      const messagesFailure = await request(app).get('/4/messages')

      expect(botFailure.status).toBe(500)
      expect(botFailure.body).toEqual({ error: 'Failed to load the bot.' })
      expect(messagesFailure.status).toBe(500)
      expect(messagesFailure.body).toEqual({ error: 'Failed to load the messages of the bot.' })
    })
  })

  describe('POST /:id/read', () => {
    it('marks the bot as read', async () => {
      markBotRead.mockResolvedValue(true)

      const res = await request(app).post('/4/read')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(markBotRead).toHaveBeenCalledWith(4, 7)
    })

    it('returns 404 for a bot that is not the user own', async () => {
      markBotRead.mockResolvedValue(false)

      expect((await request(app).post('/4/read')).status).toBe(404)
    })

    it('returns 500 when the bot cannot be marked', async () => {
      markBotRead.mockRejectedValue(new Error('db down'))

      const res = await request(app).post('/4/read')

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to mark the bot as read.' })
    })
  })

  describe('GET /:id/routines', () => {
    it('lists the routines of the bot', async () => {
      listRoutines.mockResolvedValue([ROUTINE])

      const res = await request(app).get('/4/routines')

      expect(res.status).toBe(200)
      expect(res.body.routines).toHaveLength(1)
      expect(res.body.routines[0]).toMatchObject({ id: 9, title: 'Ticket triage', paused: true })
      expect(listRoutines).toHaveBeenCalledWith({ botId: 4, userId: 7 })
    })

    it('returns 404 for a bot that is not the user own', async () => {
      getBot.mockResolvedValue(null)

      expect((await request(app).get('/4/routines')).status).toBe(404)
      expect(listRoutines).not.toHaveBeenCalled()
    })

    it('returns 500 when the routines cannot be listed', async () => {
      listRoutines.mockRejectedValue(new Error('db down'))

      const res = await request(app).get('/4/routines')

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to list the routines.' })
    })
  })

  describe('PATCH /:id/routines/:routineId', () => {
    beforeEach(() => {
      getRoutine.mockResolvedValue(ROUTINE)
      setRoutinePaused.mockImplementation(async (id, _scope, changes) => ({ ...ROUTINE, id, ...changes }))
    })

    it('pauses a routine and leaves its next run alone', async () => {
      const res = await request(app).patch('/4/routines/9').send({ paused: true })

      expect(res.status).toBe(200)
      expect(res.body.routine).toMatchObject({ id: 9, paused: true })
      expect(getRoutine).toHaveBeenCalledWith(9, { botId: 4, userId: 7 })
      expect(setRoutinePaused).toHaveBeenCalledWith(
        9,
        { botId: 4, userId: 7 },
        {
          paused: true,
          nextRunAt: ROUTINE.nextRunAt,
        }
      )
    })

    it('resumes a routine from now on', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-17T10:00:00Z'))

      const res = await request(app).patch('/4/routines/9').send({ paused: false })

      expect(res.status).toBe(200)
      expect(setRoutinePaused.mock.calls[0][2]).toEqual({
        paused: false,
        nextRunAt: new Date('2026-11-17T16:00:00Z'),
      })
    })

    it('resumes a one-off routine at its own instant', async () => {
      getRoutine.mockResolvedValue({ ...ROUTINE, frequency: 'once', hour: 9, runDate: '2026-11-20' })

      await request(app).patch('/4/routines/9').send({ paused: false })

      expect(setRoutinePaused.mock.calls[0][2].nextRunAt).toEqual(new Date('2026-11-20T08:00:00Z'))
    })

    it('rejects a paused flag that is not a boolean and a malformed routine id', async () => {
      const badFlag = await request(app).patch('/4/routines/9').send({ paused: 'yes' })
      const badId = await request(app).patch('/4/routines/x').send({ paused: true })

      expect(badFlag.status).toBe(400)
      expect(badFlag.body).toEqual({ error: 'Paused must be true or false.' })
      expect(badId.status).toBe(400)
      expect(badId.body).toEqual({ error: 'Invalid routine ID.' })
      expect(setRoutinePaused).not.toHaveBeenCalled()
    })

    it('returns 404 for a routine that is not one of the bot, or that disappeared meanwhile', async () => {
      getRoutine.mockResolvedValueOnce(null)
      const missing = await request(app).patch('/4/routines/9').send({ paused: true })
      setRoutinePaused.mockResolvedValueOnce(null)
      const vanished = await request(app).patch('/4/routines/9').send({ paused: true })

      expect(missing.status).toBe(404)
      expect(missing.body).toEqual({ error: 'Routine not found.' })
      expect(vanished.status).toBe(404)
    })

    it('returns 500 when the routine cannot be updated', async () => {
      getRoutine.mockRejectedValue(new Error('db down'))

      const res = await request(app).patch('/4/routines/9').send({ paused: true })

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to update the routine.' })
    })
  })

  describe('DELETE /:id/routines/:routineId', () => {
    it('deletes a routine of the bot', async () => {
      deleteRoutine.mockResolvedValue(true)

      const res = await request(app).delete('/4/routines/9')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(deleteRoutine).toHaveBeenCalledWith(9, { botId: 4, userId: 7 })
    })

    it('returns 404 for a routine that is not one of the bot', async () => {
      deleteRoutine.mockResolvedValue(false)

      const res = await request(app).delete('/4/routines/9')

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Routine not found.' })
    })

    it('returns 500 when the routine cannot be deleted', async () => {
      deleteRoutine.mockRejectedValue(new Error('db down'))

      const res = await request(app).delete('/4/routines/9')

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to delete the routine.' })
    })
  })
})
