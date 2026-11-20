import { describe, it, expect, vi, beforeEach } from 'vitest'

const getJevDocument = vi.fn()
vi.mock('../db/jev-documents.js', () => ({ getJevDocument }))

const getConversation = vi.fn()
const getRecord = vi.fn()
const replyToConversation = vi.fn()
vi.mock('../hubspot/client.js', () => ({
  HUBSPOT_REQUEST_FAILED: 'HUBSPOT_REQUEST_FAILED',
  getConversation,
  getRecord,
  replyToConversation,
}))

const resolveHubspotAccess = vi.fn()
vi.mock('../hubspot/settings.js', () => ({ resolveHubspotAccess }))

const getTicket = vi.fn()
const isConfigured = vi.fn()
const postPublicReply = vi.fn()
vi.mock('../zendesk/client.js', () => ({ getTicket, isConfigured, postPublicReply }))

const { LEGAL_SEND_OFF, LegalReplyError, findSendBlocker, isLegalSendAllowed, readLegalConversation, sendLegalReply } =
  await import('./replies.js')

const ZENDESK_CASE = { id: 41, source: 'zendesk', ticketId: '48213' }
const HUBSPOT_CASE = { id: 42, source: 'hubspot', ticketId: '9312' }
const REPLY_ACCESS = { permissions: { tickets: 'read', conversations: 'reply' }, canReply: true }
const AT = '2026-11-20T10:00:00.000Z'

function hubspotFailure(message) {
  return Object.assign(new Error(message), { code: 'HUBSPOT_REQUEST_FAILED' })
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveHubspotAccess.mockResolvedValue(REPLY_ACCESS)
  getRecord.mockResolvedValue({ id: '9312', properties: { hs_conversations_originating_thread_id: 'thread-1' } })
})

describe('isLegalSendAllowed', () => {
  it('follows the switch of the Legal project, off until it is saved on', async () => {
    getJevDocument.mockResolvedValueOnce(null)
    getJevDocument.mockResolvedValueOnce({ data: { set: {}, allowSend: true } })

    expect(await isLegalSendAllowed()).toBe(false)
    expect(await isLegalSendAllowed()).toBe(true)
    expect(getJevDocument).toHaveBeenCalledWith('legal')
  })

  it('names the switch in its message', () => {
    expect(LEGAL_SEND_OFF).toMatch(/Legal section of the admin/)
  })
})

describe('findSendBlocker', () => {
  it('asks to connect Zendesk only when the user has no Zendesk connection', async () => {
    isConfigured.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    expect(await findSendBlocker('zendesk', 3)).toBeNull()
    expect(await findSendBlocker('zendesk', 3)).toMatch(/Connect your Zendesk account/)
    expect(isConfigured).toHaveBeenCalledWith(3)
  })

  it('needs a HubSpot user that can reply, attended by the person sending', async () => {
    expect(await findSendBlocker('hubspot', 3)).toBeNull()
    expect(resolveHubspotAccess).toHaveBeenCalledWith({ userId: 3, unattended: false })

    resolveHubspotAccess.mockResolvedValueOnce({ ...REPLY_ACCESS, canReply: false })
    expect(await findSendBlocker('hubspot', 3)).toMatch(/cannot reply from Soporti/)

    resolveHubspotAccess.mockResolvedValueOnce(null)
    expect(await findSendBlocker('hubspot', 3)).toMatch(/cannot reply from Soporti/)
  })
})

describe('sendLegalReply', () => {
  it('posts a public Zendesk reply with the connection of the user', async () => {
    postPublicReply.mockResolvedValueOnce({ commentId: 777 }).mockResolvedValueOnce({ commentId: null })

    expect(await sendLegalReply(ZENDESK_CASE, { userId: 3, text: 'Hello' })).toBe('777')
    expect(await sendLegalReply(ZENDESK_CASE, { userId: 3, text: 'Hello' })).toBeNull()
    expect(postPublicReply).toHaveBeenCalledWith(3, '48213', 'Hello')
  })

  it('replies in the conversation of the HubSpot ticket as the HubSpot user', async () => {
    replyToConversation.mockResolvedValue({ messageId: 'm-1' })

    expect(await sendLegalReply(HUBSPOT_CASE, { userId: 3, text: 'Hello' })).toBe('m-1')
    expect(getRecord).toHaveBeenCalledWith('tickets', '9312', {
      properties: ['hs_conversations_originating_thread_id'],
      permissions: REPLY_ACCESS.permissions,
    })
    expect(replyToConversation).toHaveBeenCalledWith('thread-1', 'Hello', { userId: 3 })
  })

  it('refuses a HubSpot ticket without a conversation', async () => {
    getRecord.mockResolvedValue({ id: '9312', properties: {} })

    const failure = sendLegalReply(HUBSPOT_CASE, { userId: 3, text: 'Hello' })

    await expect(failure).rejects.toBeInstanceOf(LegalReplyError)
    await expect(failure).rejects.toThrow('This HubSpot ticket has no conversation to reply to.')
    expect(replyToConversation).not.toHaveBeenCalled()
  })

  it.each([
    [ZENDESK_CASE, () => postPublicReply.mockRejectedValue(new Error('Zendesk API 500: <html>')), /^Zendesk did not/],
    [HUBSPOT_CASE, () => replyToConversation.mockRejectedValue(new Error('socket hang up')), /^HubSpot did not/],
    [
      HUBSPOT_CASE,
      () => replyToConversation.mockRejectedValue(hubspotFailure('HubSpot refused to send the reply as ana')),
      /^HubSpot refused to send the reply as ana$/,
    ],
  ])('turns a failed %j send into a message the user can read', async (legalCase, arrange, message) => {
    arrange()

    const failure = sendLegalReply(legalCase, { userId: 3, text: 'Hello' })

    await expect(failure).rejects.toBeInstanceOf(LegalReplyError)
    await expect(failure).rejects.toThrow(message)
  })
})

describe('readLegalConversation', () => {
  it('asks to connect Zendesk before reading a Zendesk ticket', async () => {
    isConfigured.mockResolvedValue(false)

    await expect(readLegalConversation(ZENDESK_CASE, 3)).rejects.toThrow(/Connect your Zendesk account/)
    expect(getTicket).not.toHaveBeenCalled()
  })

  it('reads the public Zendesk comments, marking the customer ones', async () => {
    isConfigured.mockResolvedValue(true)
    getTicket.mockResolvedValue({
      comments: [
        { id: 1, author: 'Customer', authorRole: 'end-user', public: true, createdAt: AT, body: 'Where is my refund?' },
        { id: 2, author: 'Ana', authorRole: 'agent', public: false, createdAt: AT, body: 'Internal note' },
        { id: 3, author: null, authorRole: 'agent', public: true, createdAt: AT, body: 'On its way.' },
      ],
    })

    expect(await readLegalConversation(ZENDESK_CASE, 3)).toEqual({
      messages: [
        { id: '1', author: 'Customer', fromCustomer: true, at: AT, text: 'Where is my refund?' },
        { id: '3', author: '', fromCustomer: false, at: AT, text: 'On its way.' },
      ],
      notice: null,
    })
    expect(getTicket).toHaveBeenCalledWith(3, '48213')
  })

  it('says when a long Zendesk ticket was cut short, so the newest messages are not missed silently', async () => {
    isConfigured.mockResolvedValue(true)
    getTicket.mockResolvedValue({ comments: [], notice: 'Only the first 500 comments are included.' })

    expect((await readLegalConversation(ZENDESK_CASE, 3)).notice).toBe(
      'This ticket is long: only its first messages are shown here. Open the ticket to read the newest ones.'
    )
  })

  it('reads the public messages of the HubSpot ticket conversation, leaving the internal comments out', async () => {
    getConversation.mockResolvedValue({
      messages: [
        {
          id: 'm-1',
          type: 'MESSAGE',
          direction: 'INCOMING',
          createdAt: AT,
          from: [{ address: 'c@example.com' }],
          text: 'Hi',
        },
        { id: 'm-2', type: 'MESSAGE', direction: 'OUTGOING', createdAt: AT, from: [{ name: 'Ana' }], text: 'Hello' },
        { id: 'm-3', type: 'MESSAGE', direction: 'OUTGOING', createdAt: AT, from: [], text: 'Bot' },
        { id: 'm-4', type: 'COMMENT', direction: null, createdAt: AT, from: [{ name: 'Ana' }], text: 'Internal note' },
      ],
      after: null,
    })

    expect(await readLegalConversation(HUBSPOT_CASE, 3)).toEqual({
      messages: [
        { id: 'm-1', author: 'c@example.com', fromCustomer: true, at: AT, text: 'Hi' },
        { id: 'm-2', author: 'Ana', fromCustomer: false, at: AT, text: 'Hello' },
        { id: 'm-3', author: '', fromCustomer: false, at: AT, text: 'Bot' },
      ],
      notice: null,
    })
    expect(getConversation).toHaveBeenCalledWith('thread-1', { after: undefined })
  })

  it('reads every page of the HubSpot conversation, up to 10 pages, and says when there were more', async () => {
    getConversation.mockImplementation(async (_threadId, { after }) => {
      const page = Number(after ?? 0)
      return {
        messages: [
          { id: `m-${page}`, type: 'MESSAGE', direction: 'INCOMING', createdAt: AT, from: [], text: `Page ${page}` },
        ],
        after: String(page + 1),
      }
    })

    const { messages, notice } = await readLegalConversation(HUBSPOT_CASE, 3)

    expect(messages.map(message => message.text)).toEqual(Array.from({ length: 10 }, (_, page) => `Page ${page}`))
    expect(notice).toMatch(/^This ticket is long/)
    expect(getConversation).toHaveBeenCalledTimes(10)
    expect(getConversation).toHaveBeenNthCalledWith(2, 'thread-1', { after: '1' })
  })

  it('shows no messages for a HubSpot ticket without a conversation', async () => {
    getRecord.mockResolvedValue({ id: '9312', properties: {} })

    expect(await readLegalConversation(HUBSPOT_CASE, 3)).toEqual({ messages: [], notice: null })
    expect(getConversation).not.toHaveBeenCalled()
  })

  it('needs HubSpot conversations to be readable', async () => {
    resolveHubspotAccess.mockResolvedValue({ permissions: { tickets: 'read', conversations: 'off' } })

    await expect(readLegalConversation(HUBSPOT_CASE, 3)).rejects.toThrow(/cannot read HubSpot conversations/)
  })

  it('hides the raw error of a failed read', async () => {
    isConfigured.mockResolvedValue(true)
    getTicket.mockRejectedValue(new Error('Zendesk API 500: <html>'))

    await expect(readLegalConversation(ZENDESK_CASE, 3)).rejects.toThrow(
      'Could not read the Zendesk ticket. Try again in a moment.'
    )
  })
})
