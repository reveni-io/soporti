import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'

const getTicket = vi.fn()
vi.mock('../zendesk/client.js', () => ({ getTicket }))

const getRecord = vi.fn()
const getConversation = vi.fn()
vi.mock('../hubspot/client.js', () => ({ getRecord, getConversation }))

const resolveHubspotAccess = vi.fn()
vi.mock('../hubspot/settings.js', () => ({ resolveHubspotAccess }))

const { readLegalTickets } = await import('./tickets.js')

const logger = { warn: vi.fn() }
const READ_ALL = { tickets: 'read', conversations: 'read' }

function hash(text) {
  return createHash('sha256').update(text).digest('hex')
}

function zendeskTicket(comments) {
  return {
    id: 48213,
    url: 'https://acme.zendesk.com/agent/tickets/48213',
    subject: 'Refund for order A-10234',
    requester: { name: 'Customer A', email: 'customer-a@example.com' },
    comments,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveHubspotAccess.mockResolvedValue({ permissions: READ_ALL })
})

describe('readLegalTickets', () => {
  it('takes the last public message of the customer from Zendesk, never the agents or internal notes', async () => {
    getTicket.mockResolvedValue(
      zendeskTicket([
        { public: true, authorRole: 'end-user', body: 'First message' },
        { public: true, authorRole: 'agent', body: 'We are on it' },
        { public: true, authorRole: 'end-user', body: ' Where is my refund? ' },
        { public: false, authorRole: 'end-user', body: 'Internal' },
      ])
    )

    const [ticket] = await readLegalTickets(7, [{ source: 'zendesk', ticketId: '48213' }], { logger })

    expect(ticket).toEqual({
      source: 'zendesk',
      ticketId: '48213',
      url: 'https://acme.zendesk.com/agent/tickets/48213',
      subject: 'Refund for order A-10234',
      customer: 'customer-a@example.com',
      customerMessage: 'Where is my refund?',
      messageHash: hash('Where is my refund?'),
    })
    expect(getTicket).toHaveBeenCalledWith(7, '48213')
  })

  it('reads a HubSpot ticket from the last incoming message of its conversation', async () => {
    getRecord.mockResolvedValue({
      id: '9312',
      url: 'https://app.hubspot.com/contacts/1/record/0-5/9312',
      properties: { subject: 'Refund B-55120', content: 'Old content', hs_conversations_originating_thread_id: '77' },
    })
    getConversation.mockResolvedValue({
      messages: [
        { direction: 'INCOMING', text: 'Please refund to another account', from: [{ address: 'b@example.com' }] },
        { direction: 'OUTGOING', text: 'Thanks', from: [] },
      ],
    })

    const [ticket] = await readLegalTickets(7, [{ source: 'hubspot', ticketId: '9312' }], { logger })

    expect(ticket).toMatchObject({
      source: 'hubspot',
      ticketId: '9312',
      subject: 'Refund B-55120',
      customer: 'b@example.com',
      customerMessage: 'Please refund to another account',
    })
    expect(getRecord).toHaveBeenCalledWith('tickets', '9312', {
      properties: ['subject', 'content', 'hs_conversations_originating_thread_id'],
      permissions: READ_ALL,
    })
    expect(resolveHubspotAccess).toHaveBeenCalledWith({ userId: 7, unattended: true })
  })

  it('falls back to the ticket content when HubSpot has no conversation to read', async () => {
    resolveHubspotAccess.mockResolvedValue({ permissions: { tickets: 'read', conversations: 'off' } })
    getRecord.mockResolvedValue({ id: '9313', url: null, properties: { content: 'Cancel my order', subject: null } })

    const [ticket] = await readLegalTickets(7, [{ source: 'hubspot', ticketId: '9313' }], { logger })

    expect(ticket).toMatchObject({ customer: '', subject: '', customerMessage: 'Cancel my order' })
    expect(getConversation).not.toHaveBeenCalled()
  })

  it('skips tickets it cannot read, has no customer message or are listed twice', async () => {
    getTicket
      .mockRejectedValueOnce(Object.assign(new Error('Zendesk API error (404)'), { status: 404 }))
      .mockResolvedValueOnce(zendeskTicket([{ public: true, authorRole: 'agent', body: 'Hello' }]))
    resolveHubspotAccess.mockResolvedValueOnce(null).mockResolvedValueOnce({ permissions: { tickets: 'off' } })

    const tickets = await readLegalTickets(
      7,
      [
        { source: 'zendesk', ticketId: '1' },
        { source: 'zendesk', ticketId: '2' },
        { source: 'zendesk', ticketId: '2' },
        { source: 'hubspot', ticketId: '3' },
        { source: 'hubspot', ticketId: '4' },
      ],
      { logger }
    )

    expect(tickets).toEqual([])
    expect(getTicket).toHaveBeenCalledTimes(2)
    expect(getRecord).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith('[legal] Skipping zendesk ticket 1: Zendesk API error (404)')
  })

  it('skips a HubSpot ticket whose conversation has no customer message and no content', async () => {
    getRecord.mockResolvedValue({ id: '9314', url: null, properties: { hs_conversations_originating_thread_id: '9' } })
    getConversation.mockResolvedValue({ messages: [{ direction: 'OUTGOING', text: 'Hi', from: [] }] })

    expect(await readLegalTickets(7, [{ source: 'hubspot', ticketId: '9314' }], { logger })).toEqual([])
  })
})
