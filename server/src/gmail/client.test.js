import { describe, it, expect, vi, beforeEach } from 'vitest'

const getGoogleAccessToken = vi.fn()
const invalidateGoogleAccessToken = vi.fn()
const describeGoogleConnection = vi.fn()
const isGmailConfigured = vi.fn()
vi.mock('../google-workspace/settings.js', () => ({
  getGoogleAccessToken,
  invalidateGoogleAccessToken,
  describeGoogleConnection,
  isGmailConfigured,
}))

const { searchMessages, getThread, isConfigured, UNTRUSTED_EMAIL_NOTICE, MAX_MESSAGE_CHARS, MAX_THREAD_CHARS } =
  await import('./client.js')

const BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }
}

function encode(text) {
  return Buffer.from(text, 'utf8').toString('base64url')
}

function headers(values) {
  return Object.entries(values).map(([name, value]) => ({ name, value }))
}

function metadata(id, overrides = {}) {
  return {
    id,
    threadId: `t-${id}`,
    labelIds: ['INBOX', 'UNREAD', 'Label_42'],
    snippet: 'Can we move the call? It&#39;s urgent',
    internalDate: String(Date.parse('2026-11-16T09:30:00Z')),
    payload: {
      headers: headers({ From: 'Ana <ana@acme.com>', To: 'me@soporti.dev', Subject: 'Pricing call' }),
    },
    ...overrides,
  }
}

function routeFetch(routes) {
  global.fetch.mockImplementation(async url => {
    const match = Object.keys(routes).find(prefix => url.startsWith(`${BASE_URL}${prefix}`))
    if (!match) throw new Error(`Unexpected request ${url}`)
    return jsonResponse(routes[match])
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getGoogleAccessToken.mockResolvedValue('ya29.token')
  describeGoogleConnection.mockResolvedValue({ email: 'me@soporti.dev' })
  global.fetch = vi.fn()
})

describe('searchMessages', () => {
  it('searches with the query and limit, then summarizes each hit', async () => {
    routeFetch({
      '/messages?': { messages: [{ id: 'm1', threadId: 't-m1' }], nextPageToken: 'next' },
      '/messages/m1?': metadata('m1'),
    })

    const result = await searchMessages(7, {
      query: 'from:acme.com newer_than:7d',
      maxResults: 5,
      timeZone: 'Europe/Madrid',
    })

    const listUrl = new URL(global.fetch.mock.calls[0][0])
    expect(listUrl.searchParams.get('q')).toBe('from:acme.com newer_than:7d')
    expect(listUrl.searchParams.get('maxResults')).toBe('5')
    expect(getGoogleAccessToken).toHaveBeenCalledWith(7)
    expect(result).toEqual({
      untrustedContent: UNTRUSTED_EMAIL_NOTICE,
      messages: [
        {
          id: 'm1',
          threadId: 't-m1',
          from: 'Ana <ana@acme.com>',
          to: 'me@soporti.dev',
          subject: 'Pricing call',
          date: '2026-11-16T10:30:00+01:00',
          snippet: "Can we move the call? It's urgent",
          labels: ['INBOX', 'UNREAD'],
          url: 'https://mail.google.com/mail/u/?authuser=me%40soporti.dev#all/t-m1',
        },
      ],
      hasMore: true,
    })
  })

  it('asks Gmail only for the headers it shows', async () => {
    routeFetch({ '/messages?': { messages: [{ id: 'm1' }] }, '/messages/m1?': metadata('m1') })

    await searchMessages(7, { query: 'acme' })

    const metadataUrl = new URL(global.fetch.mock.calls[1][0])
    expect(metadataUrl.searchParams.get('format')).toBe('metadata')
    expect(metadataUrl.searchParams.getAll('metadataHeaders')).toEqual(['From', 'To', 'Cc', 'Subject', 'Date'])
  })

  it('lists the latest mail when the query is empty and caps the limit', async () => {
    routeFetch({ '/messages?': {} })

    const result = await searchMessages(7, { query: '', maxResults: 500 })

    const listUrl = new URL(global.fetch.mock.calls[0][0])
    expect(listUrl.searchParams.has('q')).toBe(false)
    expect(listUrl.searchParams.get('maxResults')).toBe('25')
    expect(result.messages).toEqual([])
    expect(result.hasMore).toBe(false)
  })

  it('links to the mailbox without an account when the email is unknown', async () => {
    describeGoogleConnection.mockResolvedValue({ email: null })
    routeFetch({ '/messages?': { messages: [{ id: 'm1' }] }, '/messages/m1?': metadata('m1') })

    const result = await searchMessages(7, { query: 'acme' })

    expect(result.messages[0].url).toBe('https://mail.google.com/mail/#all/t-m1')
  })

  it('redacts secrets in subjects and snippets and shortens long recipient lists', async () => {
    const recipients = Array.from({ length: 40 }, (_, index) => `person${index}@acme.com`).join(', ')
    routeFetch({
      '/messages?': { messages: [{ id: 'm1' }] },
      '/messages/m1?': metadata('m1', {
        snippet: 'the key is sk-abcdefghijklmnopqrstuvwxyz123456',
        payload: {
          headers: headers({
            From: 'ops@acme.com',
            To: recipients,
            Cc: 'x@acme.com',
            Subject: 'ghp_abcdefghijklmnopqrstuvwxyz1234',
          }),
        },
      }),
    })

    const [message] = (await searchMessages(7, { query: 'key' })).messages

    expect(message.snippet).toBe('the key is [redacted]')
    expect(message.subject).toBe('[redacted]')
    expect(message.to).toHaveLength(301)
    expect(message.to.endsWith('…')).toBe(true)
    expect(message.cc).toBe('x@acme.com')
  })
})

function threadMessage(id, { body, from = 'Ana <ana@acme.com>', date = '2026-11-16T09:30:00Z', parts } = {}) {
  return {
    id,
    threadId: 'thread-1',
    internalDate: String(Date.parse(date)),
    payload: {
      mimeType: parts ? 'multipart/mixed' : 'text/plain',
      headers: headers({ From: from, To: 'me@soporti.dev', Subject: 'Pricing call' }),
      body: parts ? { size: 0 } : { size: body.length, data: encode(body) },
      parts,
    },
  }
}

describe('getThread', () => {
  it('returns every message oldest first with its plain-text body', async () => {
    routeFetch({
      '/threads/thread-1?': {
        id: 'thread-1',
        messages: [threadMessage('m1', { body: 'Hello,\n\n\n\nCan we talk pricing?' })],
      },
    })

    const thread = await getThread(7, 'thread-1', { timeZone: 'Europe/Madrid' })

    expect(new URL(global.fetch.mock.calls[0][0]).searchParams.get('format')).toBe('full')
    expect(thread).toEqual({
      untrustedContent: UNTRUSTED_EMAIL_NOTICE,
      threadId: 'thread-1',
      subject: 'Pricing call',
      url: 'https://mail.google.com/mail/u/?authuser=me%40soporti.dev#all/thread-1',
      messages: [
        {
          id: 'm1',
          from: 'Ana <ana@acme.com>',
          to: 'me@soporti.dev',
          date: '2026-11-16T10:30:00+01:00',
          body: 'Hello,\n\nCan we talk pricing?',
        },
      ],
      truncated: false,
    })
  })

  it('prefers the plain-text part and lists attachments without downloading them', async () => {
    const parts = [
      {
        mimeType: 'multipart/alternative',
        filename: '',
        body: { size: 0 },
        parts: [
          { mimeType: 'text/plain', filename: '', body: { data: encode('Plain version') } },
          { mimeType: 'text/html', filename: '', body: { data: encode('<p>HTML version</p>') } },
        ],
      },
      { mimeType: 'application/pdf', filename: 'quote.pdf', body: { attachmentId: 'att-1', size: 2048 } },
    ]
    routeFetch({ '/threads/thread-1?': { id: 'thread-1', messages: [threadMessage('m1', { parts })] } })

    const [message] = (await getThread(7, 'thread-1')).messages

    expect(message.body).toBe('Plain version')
    expect(message.attachments).toEqual([{ name: 'quote.pdf', mimeType: 'application/pdf', size: 2048 }])
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('falls back to the html part without its styles', async () => {
    const parts = [
      {
        mimeType: 'text/html',
        filename: '',
        body: {
          data: encode(
            '<html><head><style>p { color: red }</style></head><body><p>Refund &amp; return</p></body></html>'
          ),
        },
      },
    ]
    routeFetch({ '/threads/thread-1?': { id: 'thread-1', messages: [threadMessage('m1', { parts })] } })

    const [message] = (await getThread(7, 'thread-1')).messages

    expect(message.body).toBe('Refund & return')
    expect(message.attachments).toBeUndefined()
  })

  it('drops quoted lines after the first message, since they repeat the messages above', async () => {
    routeFetch({
      '/threads/thread-1?': {
        id: 'thread-1',
        messages: [
          threadMessage('m1', { body: 'Forwarded context:\n> original line' }),
          threadMessage('m2', { body: 'Sure, Thursday works.\n\nOn Mon Ana wrote:\n> Can we talk pricing?\n> Thanks' }),
        ],
      },
    })

    const { messages } = await getThread(7, 'thread-1')

    expect(messages[0].body).toBe('Forwarded context:\n> original line')
    expect(messages[1].body).toBe('Sure, Thursday works.\n\nOn Mon Ana wrote:')
  })

  it('redacts secrets in bodies', async () => {
    routeFetch({
      '/threads/thread-1?': {
        id: 'thread-1',
        messages: [threadMessage('m1', { body: 'Use postgres://admin:hunter2@db.acme.com/prod' })],
      },
    })

    const [message] = (await getThread(7, 'thread-1')).messages

    expect(message.body).toBe('Use postgres://[redacted]@db.acme.com/prod')
  })

  it('caps each message and keeps the newest messages whole when the thread is too long', async () => {
    const long = 'x'.repeat(MAX_MESSAGE_CHARS + 100)
    const count = Math.ceil(MAX_THREAD_CHARS / MAX_MESSAGE_CHARS) + 1
    const messages = Array.from({ length: count }, (_, index) => threadMessage(`m${index}`, { body: long }))
    routeFetch({ '/threads/thread-1?': { id: 'thread-1', messages } })

    const thread = await getThread(7, 'thread-1')

    const lengths = thread.messages.map(message => message.body.length)
    expect(lengths.at(-1)).toBe(MAX_MESSAGE_CHARS)
    expect(lengths.reduce((sum, length) => sum + length, 0)).toBe(MAX_THREAD_CHARS)
    expect(lengths[0]).toBe(0)
    expect(thread.messages.every(message => message.truncated)).toBe(true)
    expect(thread.truncated).toBe(true)
  })

  it('encodes the thread id into the path', async () => {
    routeFetch({ '/threads/': { id: 'a/b', messages: [] } })

    const thread = await getThread(7, 'a/b')

    expect(global.fetch.mock.calls[0][0]).toContain('/threads/a%2Fb?')
    expect(thread.messages).toEqual([])
    expect(thread.subject).toBeUndefined()
  })
})

describe('isConfigured', () => {
  it('delegates to the stored Google connection of the user', async () => {
    isGmailConfigured.mockResolvedValue(true)

    expect(await isConfigured(7)).toBe(true)
    expect(isGmailConfigured).toHaveBeenCalledWith(7)
  })
})
