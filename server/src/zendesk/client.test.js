import { describe, it, expect, vi, beforeEach } from 'vitest'

const getZendeskConnection = vi.fn()
const isZendeskConfigured = vi.fn()
vi.mock('./settings.js', async () => {
  const { parseZendeskViewId } = await vi.importActual('./settings.js')
  return { getZendeskConnection, isZendeskConfigured, parseZendeskViewId }
})

const { getTicket, listViewTickets, postInternalNote, isConfigured } = await import('./client.js')

const API_TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD'
const CONNECTION = { subdomain: 'acme', email: 'ana@acme.com', apiToken: API_TOKEN, writesEnabled: true, viewId: null }
const BASE_URL = 'https://acme.zendesk.com/api/v2'
const REQUESTER = { id: 11, name: 'Carla Customer', email: 'carla@example.com', role: 'end-user' }
const AGENT = { id: 22, name: 'Ana Agent', email: 'ana@acme.com', role: 'agent' }
const TICKET = {
  id: 123,
  subject: 'Where is my refund?',
  status: 'open',
  priority: 'normal',
  tags: ['refund'],
  requester_id: 11,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-02T10:00:00Z',
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }
}

function comment(id, authorId, text, isPublic = true) {
  return { id, author_id: authorId, plain_body: text, public: isPublic, created_at: '2026-09-01T10:00:00Z' }
}

function routeFetch(routes) {
  global.fetch.mockImplementation(async url => {
    const path = url.slice(BASE_URL.length)
    const match = Object.entries(routes).find(([prefix]) => path.startsWith(prefix))
    if (!match) throw new Error(`Unexpected request to ${path}`)

    const [, handler] = match
    return typeof handler === 'function' ? handler(path) : handler
  })
}

function requestedPaths() {
  return global.fetch.mock.calls.map(([url]) => url.slice(BASE_URL.length))
}

beforeEach(() => {
  vi.clearAllMocks()
  getZendeskConnection.mockResolvedValue(CONNECTION)
  global.fetch = vi.fn()
})

describe('ticket references', () => {
  const ticketRoutes = {
    '/tickets/123.json': jsonResponse({ ticket: TICKET, users: [] }),
    '/tickets/123/comments.json': jsonResponse({ comments: [], users: [], meta: { has_more: false } }),
  }

  it.each([
    '123',
    ' #123 ',
    'https://acme.zendesk.com/agent/tickets/123',
    'acme.zendesk.com/agent/tickets/123?tab=events',
  ])('reads ticket 123 from %j', async reference => {
    routeFetch(ticketRoutes)

    const ticket = await getTicket(7, reference)

    expect(ticket.id).toBe(123)
    expect(requestedPaths()).toContain('/tickets/123.json?include=users')
  })

  it('refuses a ticket url of another Zendesk account', async () => {
    await expect(getTicket(7, 'https://globex.zendesk.com/agent/tickets/123')).rejects.toThrow(
      /globex\.zendesk\.com.*acme\.zendesk\.com/
    )
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('refuses anything that is not a ticket reference', async () => {
    await expect(getTicket(7, 'refund')).rejects.toThrow(/neither a Zendesk ticket id nor a ticket url/)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('getTicket', () => {
  it('authenticates as the agent of the requesting user with their API token', async () => {
    routeFetch({
      '/tickets/123.json': jsonResponse({ ticket: TICKET, users: [REQUESTER] }),
      '/tickets/123/comments.json': jsonResponse({ comments: [], users: [], meta: { has_more: false } }),
    })

    await getTicket(7, '123')

    expect(getZendeskConnection).toHaveBeenCalledWith(7)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url.startsWith(BASE_URL)).toBe(true)
    expect(options.headers.Authorization).toBe(
      `Basic ${Buffer.from(`ana@acme.com/token:${API_TOKEN}`).toString('base64')}`
    )
  })

  it('returns the ticket with its requester and the whole thread, flagging internal notes and author roles', async () => {
    routeFetch({
      '/tickets/123.json': jsonResponse({ ticket: TICKET, users: [REQUESTER] }),
      '/tickets/123/comments.json': jsonResponse({
        comments: [comment(1, 11, 'I want my money back'), comment(2, 22, 'Checked the order, refund pending', false)],
        users: [REQUESTER, AGENT],
        meta: { has_more: false },
      }),
    })

    const ticket = await getTicket(7, 'https://acme.zendesk.com/agent/tickets/123')

    expect(ticket).toEqual({
      id: 123,
      url: 'https://acme.zendesk.com/agent/tickets/123',
      subject: 'Where is my refund?',
      status: 'open',
      priority: 'normal',
      tags: ['refund'],
      requester: { name: 'Carla Customer', email: 'carla@example.com' },
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-02T10:00:00Z',
      comments: [
        {
          id: 1,
          author: 'Carla Customer',
          authorRole: 'end-user',
          public: true,
          createdAt: '2026-09-01T10:00:00Z',
          body: 'I want my money back',
        },
        {
          id: 2,
          author: 'Ana Agent',
          authorRole: 'agent',
          public: false,
          createdAt: '2026-09-01T10:00:00Z',
          body: 'Checked the order, refund pending',
        },
      ],
    })
  })

  it('follows the comment cursor and says when the thread was capped', async () => {
    routeFetch({
      '/tickets/123.json': jsonResponse({ ticket: TICKET, users: [] }),
      '/tickets/123/comments.json': path =>
        jsonResponse({
          comments: [comment(path.length, 11, 'again')],
          users: [],
          meta: { has_more: true, after_cursor: 'next' },
        }),
    })

    const ticket = await getTicket(7, '123')

    expect(ticket.comments).toHaveLength(5)
    expect(ticket.notice).toMatch(/Only the first 500 comments/)
    expect(requestedPaths().filter(path => path.includes('page[after]=next'))).toHaveLength(4)
  })

  it('cuts a very long comment and marks it as truncated', async () => {
    routeFetch({
      '/tickets/123.json': jsonResponse({ ticket: TICKET, users: [] }),
      '/tickets/123/comments.json': jsonResponse({
        comments: [comment(1, 11, 'x'.repeat(12_000))],
        users: [],
        meta: { has_more: false },
      }),
    })

    const [only] = (await getTicket(7, '123')).comments

    expect(only.body).toHaveLength(10_000)
    expect(only.truncated).toBe(true)
  })

  it('reads a ticket that is in the view the connection is scoped to', async () => {
    getZendeskConnection.mockResolvedValue({ ...CONNECTION, viewId: '42' })
    routeFetch({
      '/views/42/tickets.json': jsonResponse({ tickets: [{ id: 123 }], meta: { has_more: false } }),
      '/tickets/123.json': jsonResponse({ ticket: TICKET, users: [] }),
      '/tickets/123/comments.json': jsonResponse({ comments: [], users: [], meta: { has_more: false } }),
    })

    const ticket = await getTicket(7, '123')

    expect(ticket.id).toBe(123)
  })

  it('refuses a ticket outside the scoped view without reading it', async () => {
    getZendeskConnection.mockResolvedValue({ ...CONNECTION, viewId: '42' })
    routeFetch({ '/views/42/tickets.json': jsonResponse({ tickets: [{ id: 999 }], meta: { has_more: false } }) })

    await expect(getTicket(7, '123')).rejects.toThrow(/not in Zendesk view 42/)
    expect(requestedPaths().some(path => path.startsWith('/tickets/'))).toBe(false)
  })

  it('refuses when the scoped view is too large to confirm the ticket is in it', async () => {
    getZendeskConnection.mockResolvedValue({ ...CONNECTION, viewId: '42' })
    routeFetch({
      '/views/42/tickets.json': jsonResponse({ tickets: [{ id: 1 }], meta: { has_more: true, after_cursor: 'c' } }),
    })

    await expect(getTicket(7, '123')).rejects.toThrow(/could not be confirmed/)
    expect(global.fetch).toHaveBeenCalledTimes(10)
  })

  it('fails with a reconnect hint when Zendesk rejects the credentials', async () => {
    routeFetch({
      '/tickets/123.json': jsonResponse({ error: 'Couldn’t authenticate you' }, 401),
      '/tickets/123/comments.json': jsonResponse({ error: 'Couldn’t authenticate you' }, 401),
    })

    await expect(getTicket(7, '123')).rejects.toThrow(/reconnect Zendesk in Settings → Connections/)
  })

  it('explains a forbidden request and reports other failures with their status', async () => {
    routeFetch({
      '/tickets/123.json': jsonResponse({ error: 'Forbidden' }, 403),
      '/tickets/123/comments.json': jsonResponse({ comments: [], users: [], meta: { has_more: false } }),
    })
    await expect(getTicket(7, '123')).rejects.toThrow(/not allowed to do that/)

    routeFetch({
      '/tickets/123.json': jsonResponse({ error: 'RecordNotFound' }, 404),
      '/tickets/123/comments.json': jsonResponse({ comments: [], users: [], meta: { has_more: false } }),
    })
    await expect(getTicket(7, '123')).rejects.toThrow(/failed \(404\)/)
  })

  it('fails clearly when the user has not connected Zendesk', async () => {
    getZendeskConnection.mockResolvedValue(null)

    await expect(getTicket(7, '123')).rejects.toThrow(/Connect a Zendesk account in Settings → Connections/)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('listViewTickets', () => {
  it('lists the tickets of the requested view with their requesters', async () => {
    routeFetch({
      '/views/77/tickets.json': jsonResponse({
        tickets: [
          { ...TICKET, id: 1 },
          { ...TICKET, id: 2 },
        ],
        meta: { has_more: true },
      }),
      '/users/show_many.json': jsonResponse({ users: [REQUESTER] }),
    })

    const result = await listViewTickets(7, '77')

    expect(result).toEqual({
      viewId: '77',
      truncated: true,
      tickets: [1, 2].map(id => ({
        id,
        url: `https://acme.zendesk.com/agent/tickets/${id}`,
        subject: 'Where is my refund?',
        requester: { name: 'Carla Customer', email: 'carla@example.com' },
        status: 'open',
        updatedAt: '2026-09-02T10:00:00Z',
      })),
    })
    expect(requestedPaths()).toContain('/users/show_many.json?ids=11')
  })

  it('defaults to the view the connection is scoped to', async () => {
    getZendeskConnection.mockResolvedValue({ ...CONNECTION, viewId: '42' })
    routeFetch({ '/views/42/tickets.json': jsonResponse({ tickets: [], meta: { has_more: false } }) })

    const result = await listViewTickets(7)

    expect(result).toEqual({ viewId: '42', tickets: [], truncated: false })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('refuses another view than the one the connection is scoped to', async () => {
    getZendeskConnection.mockResolvedValue({ ...CONNECTION, viewId: '42' })

    await expect(listViewTickets(7, '77')).rejects.toThrow(/scoped to view 42 and cannot read view 77/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('asks for a view id when neither the call nor the connection has one', async () => {
    await expect(listViewTickets(7)).rejects.toThrow(/No view id/)
    await expect(listViewTickets(7, 'mine')).rejects.toThrow(/view id is a number/)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('postInternalNote', () => {
  it('adds a private comment and nothing else to the ticket', async () => {
    routeFetch({
      '/tickets/123.json': jsonResponse({ ticket: TICKET, audit: { events: [{ id: 555, type: 'Comment' }] } }),
    })

    const result = await postInternalNote(7, '#123', '  Draft: your refund is on its way.  ')

    expect(result).toEqual({
      ticketId: 123,
      noteId: 555,
      public: false,
      url: 'https://acme.zendesk.com/agent/tickets/123',
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, options] = global.fetch.mock.calls[0]
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({
      ticket: { comment: { body: 'Draft: your refund is on its way.', public: false } },
    })
  })

  it('redacts secrets before the note leaves the app', async () => {
    routeFetch({ '/tickets/123.json': jsonResponse({ ticket: TICKET, audit: { events: [] } }) })

    const result = await postInternalNote(7, '123', 'Use sk-abcdefghijklmnopqrstuvwxyz123456 to retry')

    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).ticket.comment.body).toBe('Use [redacted] to retry')
    expect(result.noteId).toBeNull()
  })

  it('refuses an empty note', async () => {
    await expect(postInternalNote(7, '123', '   ')).rejects.toThrow(/needs a body/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('refuses a ticket outside the scoped view without writing', async () => {
    getZendeskConnection.mockResolvedValue({ ...CONNECTION, viewId: '42' })
    routeFetch({ '/views/42/tickets.json': jsonResponse({ tickets: [], meta: { has_more: false } }) })

    await expect(postInternalNote(7, '123', 'Draft')).rejects.toThrow(/not in Zendesk view 42/)
    expect(global.fetch.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(false)
  })
})

describe('isConfigured', () => {
  it('checks the connection of the requesting user', async () => {
    isZendeskConfigured.mockResolvedValue(true)

    expect(await isConfigured(7)).toBe(true)
    expect(isZendeskConfigured).toHaveBeenCalledWith(7)
  })
})
