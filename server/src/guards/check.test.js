import { describe, it, expect, vi, beforeEach } from 'vitest'

const runJevCheck = vi.fn()
vi.mock('../jev/check.js', () => ({ runJevCheck }))

const saveLegalCase = vi.fn()
vi.mock('../db/legal-cases.js', () => ({ saveLegalCase }))

const readLegalTickets = vi.fn()
vi.mock('../legal/tickets.js', () => ({ readLegalTickets }))

const { checkContent, checkTicketReply, toGuardPart } = await import('./check.js')

const GUARD = { id: 'legal', name: 'Legal' }
const ROWS = [
  { questionId: 'q1', question: 'Is it unusual?', answer: 'Yes', confidence: 0.9, flagged: true, unsure: false },
  { questionId: 'q2', question: 'Is it safe?', answer: 'Yes', confidence: 0.95, flagged: false, unsure: false },
]
const ANSWERED = { status: 'answered', setVersion: 7, model: 'jev-1', minConfidence: 0.7, rows: ROWS }
const TICKET = {
  source: 'zendesk',
  ticketId: '48213',
  url: 'https://acme.zendesk.com/agent/tickets/48213',
  subject: 'Refund',
  customer: 'customer-a@example.com',
  customerMessage: 'Where is my refund?',
  messageHash: 'abc',
}
const REPLY = {
  draft: { subject: 'Your refund', body: 'We issued it on 15 November.' },
  dataFacts: [{ fact: 'Refund issued 15 Nov', source: 'database' }],
  language: 'en',
}

beforeEach(() => {
  vi.clearAllMocks()
  readLegalTickets.mockResolvedValue([TICKET])
  runJevCheck.mockResolvedValue(ANSWERED)
  saveLegalCase.mockResolvedValue(41)
})

describe('checkContent', () => {
  it('asks the guard about the content and counts its warnings', async () => {
    const result = await checkContent(GUARD, 'Can we promise a refund in 2 days?')

    expect(runJevCheck).toHaveBeenCalledWith({
      project: 'legal',
      state: { content: 'Can we promise a refund in 2 days?' },
    })
    expect(result).toEqual({
      guard: 'Legal',
      status: 'checked',
      reason: null,
      warnings: 1,
      review: { setVersion: 7, minConfidence: 0.7, rows: ROWS },
    })
  })

  it('says the review could not run without naming the service', async () => {
    runJevCheck.mockResolvedValue({ status: 'unavailable', setVersion: 7, reason: 'Jev calls are off' })

    expect(await checkContent(GUARD, 'Anything')).toEqual({
      guard: 'Legal',
      status: 'not_checked',
      reason: 'the review could not run',
      warnings: 0,
      review: null,
    })
  })
})

describe('checkTicketReply', () => {
  it('reads the customer message, checks the reply and saves the case in the conversation', async () => {
    const result = await checkTicketReply(GUARD, {
      userId: 3,
      ticket: { source: 'zendesk', ticketId: '48213' },
      reply: REPLY,
      cases: { conversationId: 'conv-1' },
    })

    expect(readLegalTickets).toHaveBeenCalledWith(3, [{ source: 'zendesk', ticketId: '48213' }])
    expect(runJevCheck).toHaveBeenCalledWith({
      project: 'legal',
      state: {
        ticket: { source: 'zendesk', subject: 'Refund', customer: 'customer-a@example.com' },
        customerMessage: 'Where is my refund?',
        dataFacts: REPLY.dataFacts,
        draft: REPLY.draft,
        language: 'en',
      },
    })
    expect(saveLegalCase).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 3,
        guardId: 'legal',
        conversationId: 'conv-1',
        messageHash: 'abc',
        status: 'checked',
        warnings: 1,
        jev: { setVersion: 7, model: 'jev-1', minConfidence: 0.7, rows: ROWS },
      })
    )
    expect(result).toEqual({
      id: 41,
      guard: 'Legal',
      source: 'zendesk',
      ticketId: '48213',
      ticketUrl: TICKET.url,
      customer: 'customer-a@example.com',
      subject: 'Refund',
      customerMessage: 'Where is my refund?',
      dataFacts: REPLY.dataFacts,
      draft: REPLY.draft,
      language: 'en',
      status: 'checked',
      setVersion: 7,
      warnings: 1,
      reason: null,
      review: { setVersion: 7, minConfidence: 0.7, rows: ROWS },
    })
  })

  it('does not save a case where nobody can send it', async () => {
    const result = await checkTicketReply(GUARD, { userId: 3, ticket: TICKET, reply: REPLY })

    expect(saveLegalCase).not.toHaveBeenCalled()
    expect(result.id).toBeNull()
  })

  it('returns nothing when the ticket cannot be read', async () => {
    readLegalTickets.mockResolvedValue([])

    expect(await checkTicketReply(GUARD, { userId: 3, ticket: TICKET, reply: REPLY })).toBeNull()
    expect(runJevCheck).not.toHaveBeenCalled()
  })
})

describe('toGuardPart', () => {
  it('shows a case with the cases of a run and a check as a review', () => {
    expect(toGuardPart({ kind: 'case', case: { id: 41 } })).toEqual({ type: 'legal-run', cases: [{ id: 41 }] })
    expect(toGuardPart({ kind: 'check', check: { guard: 'Legal', warnings: 0 } })).toEqual({
      type: 'guard-check',
      guard: 'Legal',
      warnings: 0,
    })
  })
})
