import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const findOwnedLegalCases = vi.fn()
const getOwnedLegalCase = vi.fn()
vi.mock('../db/legal-cases.js', () => ({ findOwnedLegalCases, getOwnedLegalCase }))

const listLegalReplies = vi.fn()
vi.mock('../db/legal-replies.js', () => ({ listLegalReplies }))

const findSendBlocker = vi.fn()
const readLegalConversation = vi.fn()
vi.mock('../legal/replies.js', async importOriginal => ({
  ...(await importOriginal()),
  findSendBlocker,
  readLegalConversation,
}))

const { LegalReplyError } = await import('../legal/replies.js')
const { default: legalRouter } = await import('./legal.js')

const CHECKED = { id: 41, guardId: 'legal', source: 'zendesk', ticketId: '48213', status: 'checked', warnings: 0 }
const CAREFUL = { id: 42, guardId: 'legal', source: 'hubspot', ticketId: '9312', status: 'checked', warnings: 2 }
const SENT_AT = '2026-11-20T10:00:00.000Z'
const REPLY = { id: 7, caseId: 41, sentBy: 'ana@example.com', text: 'Hello', sentAt: SENT_AT }

let app

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  findSendBlocker.mockResolvedValue(null)
  listLegalReplies.mockResolvedValue([])
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
  it('cannot list or read Legal replies', async () => {
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
      request(keyApp).get('/cases/41/conversation'),
    ])

    for (const res of responses) {
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'API keys cannot send or read Legal replies.' })
    }
    expect(findOwnedLegalCases).not.toHaveBeenCalled()
    expect(readLegalConversation).not.toHaveBeenCalled()
  })
})
