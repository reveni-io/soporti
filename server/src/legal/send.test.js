import { describe, it, expect, vi, beforeEach } from 'vitest'

const listLegalReplies = vi.fn()
const saveLegalReply = vi.fn()
vi.mock('../db/legal-replies.js', () => ({ listLegalReplies, saveLegalReply }))

const findSendBlocker = vi.fn()
const sendLegalReply = vi.fn()
vi.mock('./replies.js', () => ({ findSendBlocker, sendLegalReply }))

const { ALREADY_SENT, SENT_NOT_RECORDED, WARNINGS_NOT_READ, parseReplyText, sendCaseReply } = await import('./send.js')

const CASE = { id: 41, source: 'zendesk', ticketId: '48213', status: 'checked', warnings: 0 }
const USER = { id: 3, email: 'ana@example.com' }
const SENT_AT = '2026-11-20T10:00:00.000Z'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  listLegalReplies.mockResolvedValue([])
  findSendBlocker.mockResolvedValue(null)
  sendLegalReply.mockResolvedValue('zd-1')
  saveLegalReply.mockResolvedValue({ id: 7, caseId: 41, sentBy: USER.email, text: 'Hello', sentAt: SENT_AT })
})

describe('parseReplyText', () => {
  it('trims the reply and refuses an empty or too long one', () => {
    expect(parseReplyText(' Hello ')).toEqual({ value: 'Hello' })
    expect(parseReplyText(' ')).toEqual({ error: 'The reply is empty.' })
    expect(parseReplyText(7)).toEqual({ error: 'The reply is empty.' })
    expect(parseReplyText('x'.repeat(10_001))).toEqual({ error: 'The reply is too long (max 10000 characters).' })
  })
})

describe('sendCaseReply', () => {
  it('sends the reply as the user through the ticket and records it', async () => {
    const result = await sendCaseReply({ legalCase: CASE, user: USER, text: 'Hello', warningsRead: false })

    expect(sendLegalReply).toHaveBeenCalledWith(CASE, { userId: 3, text: 'Hello' })
    expect(saveLegalReply).toHaveBeenCalledWith({
      caseId: 41,
      userId: 3,
      sentBy: 'ana@example.com',
      text: 'Hello',
      externalId: 'zd-1',
    })
    expect(result).toEqual({ reply: { id: 7, sentBy: 'ana@example.com', text: 'Hello', sentAt: SENT_AT } })
  })

  it('does not send the same reply twice or where the user cannot send', async () => {
    listLegalReplies.mockResolvedValueOnce([{ text: 'Hello' }])
    findSendBlocker.mockResolvedValueOnce('Connect Zendesk')
    const input = { legalCase: CASE, user: USER, text: 'Hello', warningsRead: true }

    expect(await sendCaseReply(input)).toEqual({ blocker: ALREADY_SENT })
    expect(await sendCaseReply(input)).toEqual({ blocker: 'Connect Zendesk' })
    expect(sendLegalReply).not.toHaveBeenCalled()
  })

  it('asks to confirm the warnings of a case that has them or was not checked', async () => {
    const careful = { ...CASE, warnings: 2 }
    const unchecked = { ...CASE, status: 'not_checked' }

    expect(await sendCaseReply({ legalCase: careful, user: USER, text: 'Hi', warningsRead: false })).toEqual({
      unconfirmed: WARNINGS_NOT_READ,
    })
    expect(await sendCaseReply({ legalCase: unchecked, user: USER, text: 'Hi', warningsRead: false })).toEqual({
      unconfirmed: WARNINGS_NOT_READ,
    })
    expect(
      (await sendCaseReply({ legalCase: careful, user: USER, text: 'Hi', warningsRead: true })).reply
    ).toBeDefined()
  })

  it('says when the reply went out but could not be recorded', async () => {
    saveLegalReply.mockRejectedValue(new Error('db down'))

    const result = await sendCaseReply({ legalCase: CASE, user: USER, text: 'Hello', warningsRead: false })

    expect(result).toEqual({
      reply: { id: null, sentBy: 'ana@example.com', text: 'Hello', sentAt: expect.any(String) },
      warning: SENT_NOT_RECORDED,
    })
  })
})
