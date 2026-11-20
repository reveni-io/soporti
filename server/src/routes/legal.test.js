import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const findOwnedLegalCases = vi.fn()
const getOwnedLegalCase = vi.fn()
vi.mock('../db/legal-cases.js', () => ({ findOwnedLegalCases, getOwnedLegalCase }))

const listLegalReplies = vi.fn()
const saveLegalReply = vi.fn()
vi.mock('../db/legal-replies.js', () => ({ listLegalReplies, saveLegalReply }))

const findSendBlocker = vi.fn()
const isLegalSendAllowed = vi.fn()
const readLegalConversation = vi.fn()
const sendLegalReply = vi.fn()
vi.mock('../legal/replies.js', async importOriginal => ({
  ...(await importOriginal()),
  findSendBlocker,
  isLegalSendAllowed,
  readLegalConversation,
  sendLegalReply,
}))

const { LEGAL_SEND_OFF, LegalReplyError } = await import('../legal/replies.js')
const { default: legalRouter } = await import('./legal.js')

const CHECKED = { id: 41, source: 'zendesk', ticketId: '48213', status: 'checked', warnings: 0 }
const CAREFUL = { id: 42, source: 'hubspot', ticketId: '9312', status: 'checked', warnings: 2 }
const SENT_AT = '2026-11-20T10:00:00.000Z'
const REPLY = { id: 7, caseId: 41, sentBy: 'ana@example.com', text: 'Hello', sentAt: SENT_AT }

let app

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  isLegalSendAllowed.mockResolvedValue(true)
  findSendBlocker.mockResolvedValue(null)
  app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.user = { id: 3, email: 'ana@example.com' }
    next()
  })
  app.use('/', legalRouter)
})

describe('GET /cases', () => {
  it('returns the replies and whether each case can be sent, for the cases of the user only', async () => {
    findOwnedLegalCases.mockResolvedValue([CHECKED, CAREFUL])
    listLegalReplies.mockResolvedValue([REPLY])
    findSendBlocker.mockImplementation(async source => (source === 'hubspot' ? 'No HubSpot reply' : null))

    const res = await request(app).get('/cases?ids=41,42,41,99')

    expect(res.status).toBe(200)
    expect(findOwnedLegalCases).toHaveBeenCalledWith([41, 42, 99], 3)
    expect(listLegalReplies).toHaveBeenCalledWith([41, 42])
    expect(res.body.cases).toEqual([
      {
        id: 41,
        replies: [{ id: 7, sentBy: 'ana@example.com', text: 'Hello', sentAt: SENT_AT }],
        send: { allowed: true, reason: null },
      },
      { id: 42, replies: [], send: { allowed: false, reason: 'No HubSpot reply' } },
    ])
  })

  it('says sending is off without asking the sources', async () => {
    isLegalSendAllowed.mockResolvedValue(false)
    findOwnedLegalCases.mockResolvedValue([CHECKED])
    listLegalReplies.mockResolvedValue([])

    const res = await request(app).get('/cases?ids=41')

    expect(res.body.cases[0].send).toEqual({ allowed: false, reason: LEGAL_SEND_OFF })
    expect(findSendBlocker).not.toHaveBeenCalled()
  })

  it.each(['', 'abc', Array.from({ length: 51 }, (_, index) => index + 1).join(',')])(
    'rejects the ids %j',
    async ids => {
      const res = await request(app).get(`/cases?ids=${ids}`)

      expect(res.status).toBe(400)
      expect(findOwnedLegalCases).not.toHaveBeenCalled()
    }
  )

  it('returns 500 when the cases cannot be read', async () => {
    findOwnedLegalCases.mockRejectedValue(new Error('db down'))

    const res = await request(app).get('/cases?ids=41')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to load the cases.' })
  })
})

describe('POST /cases/:id/replies', () => {
  it('sends the reply as the user and records it', async () => {
    getOwnedLegalCase.mockResolvedValue(CHECKED)
    sendLegalReply.mockResolvedValue('777')
    saveLegalReply.mockResolvedValue(REPLY)

    const res = await request(app).post('/cases/41/replies').send({ text: '  Hello  ' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ reply: { id: 7, sentBy: 'ana@example.com', text: 'Hello', sentAt: SENT_AT } })
    expect(getOwnedLegalCase).toHaveBeenCalledWith(41, 3)
    expect(sendLegalReply).toHaveBeenCalledWith(CHECKED, { userId: 3, text: 'Hello' })
    expect(saveLegalReply).toHaveBeenCalledWith({
      caseId: 41,
      userId: 3,
      sentBy: 'ana@example.com',
      text: 'Hello',
      externalId: '777',
    })
  })

  it('asks to confirm the warnings of a case that needs care', async () => {
    getOwnedLegalCase.mockResolvedValue(CAREFUL)

    const res = await request(app).post('/cases/42/replies').send({ text: 'Hello' })

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'Confirm that you read the warnings of this case before sending.' })
    expect(sendLegalReply).not.toHaveBeenCalled()

    sendLegalReply.mockResolvedValue(null)
    saveLegalReply.mockResolvedValue({ ...REPLY, caseId: 42 })
    const confirmed = await request(app).post('/cases/42/replies').send({ text: 'Hello', warningsRead: true })

    expect(confirmed.status).toBe(201)
  })

  it('does not send when sending is off or the user cannot send from that source', async () => {
    getOwnedLegalCase.mockResolvedValue(CHECKED)
    isLegalSendAllowed.mockResolvedValueOnce(false)

    const off = await request(app).post('/cases/41/replies').send({ text: 'Hello' })
    findSendBlocker.mockResolvedValueOnce('Connect Zendesk')
    const blocked = await request(app).post('/cases/41/replies').send({ text: 'Hello' })

    expect(off.status).toBe(403)
    expect(off.body).toEqual({ error: LEGAL_SEND_OFF })
    expect(blocked.status).toBe(403)
    expect(blocked.body).toEqual({ error: 'Connect Zendesk' })
    expect(sendLegalReply).not.toHaveBeenCalled()
  })

  it.each([
    [{}, 'The reply is empty.'],
    [{ text: '   ' }, 'The reply is empty.'],
    [{ text: 'x'.repeat(10_001) }, 'The reply is too long (max 10000 characters).'],
  ])('rejects %j', async (body, error) => {
    const res = await request(app).post('/cases/41/replies').send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error })
    expect(getOwnedLegalCase).not.toHaveBeenCalled()
  })

  it('answers 404 for a case of someone else or a bad id', async () => {
    getOwnedLegalCase.mockResolvedValue(null)

    const other = await request(app).post('/cases/41/replies').send({ text: 'Hello' })
    const bad = await request(app).post('/cases/abc/replies').send({ text: 'Hello' })

    expect(other.status).toBe(404)
    expect(bad.status).toBe(404)
    expect(sendLegalReply).not.toHaveBeenCalled()
  })

  it('reports why the source refused the reply, and records nothing', async () => {
    getOwnedLegalCase.mockResolvedValue(CHECKED)
    sendLegalReply.mockRejectedValue(new LegalReplyError('Zendesk did not take the reply, so nothing was sent.'))

    const res = await request(app).post('/cases/41/replies').send({ text: 'Hello' })

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Zendesk did not take the reply, so nothing was sent.' })
    expect(saveLegalReply).not.toHaveBeenCalled()
  })

  it('returns the sent reply with a warning when only recording it failed, so it is not sent twice', async () => {
    getOwnedLegalCase.mockResolvedValue(CHECKED)
    sendLegalReply.mockResolvedValue('777')
    saveLegalReply.mockRejectedValue(new Error('db down'))

    const res = await request(app).post('/cases/41/replies').send({ text: 'Hello' })

    expect(res.status).toBe(201)
    expect(res.body.reply).toEqual({ id: null, sentBy: 'ana@example.com', text: 'Hello', sentAt: expect.any(String) })
    expect(res.body.warning).toMatch(/^The reply was sent, but Soporti could not record it/)
  })

  it('hides an unexpected error', async () => {
    getOwnedLegalCase.mockRejectedValue(new Error('db down'))

    const res = await request(app).post('/cases/41/replies').send({ text: 'Hello' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to send the reply.' })
  })
})

describe('GET /cases/:id/conversation', () => {
  it('reads the ticket conversation of a case of the user', async () => {
    const messages = [{ id: '1', author: 'Customer', fromCustomer: true, at: SENT_AT, text: 'Where is my refund?' }]
    getOwnedLegalCase.mockResolvedValue(CHECKED)
    readLegalConversation.mockResolvedValue({ messages, notice: 'This ticket is long.' })

    const res = await request(app).get('/cases/41/conversation')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ messages, notice: 'This ticket is long.' })
    expect(readLegalConversation).toHaveBeenCalledWith(CHECKED, 3)
  })

  it('answers 404 for a case of someone else or a bad id', async () => {
    getOwnedLegalCase.mockResolvedValue(null)

    expect((await request(app).get('/cases/41/conversation')).status).toBe(404)
    expect((await request(app).get('/cases/x/conversation')).status).toBe(404)
  })

  it('reports why the ticket could not be read, and hides unexpected errors', async () => {
    getOwnedLegalCase.mockResolvedValue(CHECKED)
    readLegalConversation.mockRejectedValueOnce(new LegalReplyError('Could not read the Zendesk ticket.'))

    const known = await request(app).get('/cases/41/conversation')
    readLegalConversation.mockRejectedValueOnce(new Error('boom'))
    const unknown = await request(app).get('/cases/41/conversation')

    expect(known.status).toBe(502)
    expect(known.body).toEqual({ error: 'Could not read the Zendesk ticket.' })
    expect(unknown.status).toBe(500)
    expect(unknown.body).toEqual({ error: 'Failed to read the conversation.' })
  })
})

describe('API keys', () => {
  it('cannot list, send or read Legal replies', async () => {
    const keyApp = express()
    keyApp.use(express.json())
    keyApp.use((req, _res, next) => {
      req.user = { id: 3, email: 'ana@example.com' }
      req.apiKey = { id: 9, sources: ['integration:notion'] }
      next()
    })
    keyApp.use('/', legalRouter)

    const responses = await Promise.all([
      request(keyApp).get('/cases?ids=41'),
      request(keyApp).post('/cases/41/replies').send({ text: 'Hello', warningsRead: true }),
      request(keyApp).get('/cases/41/conversation'),
    ])

    for (const res of responses) {
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'API keys cannot send or read Legal replies.' })
    }
    expect(findOwnedLegalCases).not.toHaveBeenCalled()
    expect(sendLegalReply).not.toHaveBeenCalled()
    expect(readLegalConversation).not.toHaveBeenCalled()
  })
})
