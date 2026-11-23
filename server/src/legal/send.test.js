import { describe, it, expect, vi, beforeEach } from 'vitest'

const listLegalReplies = vi.fn()
const saveLegalReply = vi.fn()
vi.mock('../db/legal-replies.js', () => ({ listLegalReplies, saveLegalReply }))

const findSendBlocker = vi.fn()
const sendLegalReply = vi.fn()
vi.mock('./replies.js', () => ({ findSendBlocker, sendLegalReply }))

const { ALREADY_SENDING, ALREADY_SENT, NOT_SHOWN_YET, SENT_NOT_RECORDED, WARNINGS_NOT_READ, sendCaseReply } =
  await import('./send.js')

const CHECKED_AT = '2026-11-20T09:00:00.000Z'
const TURN_STARTED_AT = new Date('2026-11-20T09:05:00.000Z')
const CASE = {
  id: 41,
  source: 'zendesk',
  ticketId: '48213',
  status: 'checked',
  warnings: 0,
  draft: { subject: 'Your refund', body: ' Hello ' },
  warningsShownTurn: null,
  createdAt: CHECKED_AT,
}
const USER = { id: 3, email: 'ana@example.com' }
const SENT_AT = '2026-11-20T10:00:00.000Z'

function send(overrides = {}) {
  return sendCaseReply({
    legalCase: CASE,
    user: USER,
    warningsRead: false,
    turnStartedAt: TURN_STARTED_AT,
    completedTurns: 4,
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  listLegalReplies.mockResolvedValue([])
  findSendBlocker.mockResolvedValue(null)
  sendLegalReply.mockResolvedValue('zd-1')
  saveLegalReply.mockResolvedValue({ id: 7, caseId: 41, sentBy: USER.email, text: 'Hello', sentAt: SENT_AT })
})

describe('sendCaseReply', () => {
  it('sends the draft the guards checked as the user through the ticket and records it', async () => {
    const result = await send()

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

  it('sends nothing in the same turn that checked the case, whatever the warnings confirmation says', async () => {
    const result = await send({ warningsRead: true, turnStartedAt: new Date('2026-11-20T08:59:00.000Z') })

    expect(result).toEqual({ blocker: NOT_SHOWN_YET })
    expect(sendLegalReply).not.toHaveBeenCalled()
  })

  it.each([
    [{ subject: 'Your refund', body: '  ' }, 'The reply is empty.'],
    [null, 'The reply is empty.'],
    [{ subject: 'Your refund', body: 'x'.repeat(10_001) }, 'The reply is too long (max 10000 characters).'],
  ])('refuses the draft %#', async (draft, blocker) => {
    expect(await send({ legalCase: { ...CASE, draft } })).toEqual({ blocker })
    expect(sendLegalReply).not.toHaveBeenCalled()
  })

  it('does not send the same reply twice or where the user cannot send', async () => {
    listLegalReplies.mockResolvedValueOnce([{ text: 'Hello' }])
    findSendBlocker.mockResolvedValueOnce('Connect Zendesk')

    expect(await send({ warningsRead: true })).toEqual({ blocker: ALREADY_SENT })
    expect(await send({ warningsRead: true })).toEqual({ blocker: 'Connect Zendesk' })
    expect(sendLegalReply).not.toHaveBeenCalled()
  })

  it('sends a case with warnings once the user confirms them in one of the two messages after they were shown', async () => {
    const nextMessage = { ...CASE, warnings: 2, warningsShownTurn: 3 }
    const afterTheWarnings = { ...CASE, status: 'not_checked', warningsShownTurn: 2 }

    expect((await send({ legalCase: nextMessage, warningsRead: true })).reply).toBeDefined()
    expect((await send({ legalCase: afterTheWarnings, warningsRead: true })).reply).toBeDefined()
  })

  it('asks to confirm the warnings while the confirmation is still open', async () => {
    const shown = { ...CASE, warnings: 2, warningsShownTurn: 3 }

    expect(await send({ legalCase: shown })).toEqual({ unconfirmed: WARNINGS_NOT_READ })
    expect(sendLegalReply).not.toHaveBeenCalled()
  })

  it.each([
    ['three messages after it was shown', 1],
    ['from a scheduled query, never shown in the chat', null],
  ])('says the confirmation expired for a case %s', async (_case, warningsShownTurn) => {
    const shown = { ...CASE, warnings: 2, warningsShownTurn }

    expect(await send({ legalCase: shown, warningsRead: true })).toEqual({ expired: true })
    expect(sendLegalReply).not.toHaveBeenCalled()
  })

  it('sends a case once when two sends of it run at the same time', async () => {
    let finishSending
    sendLegalReply.mockReturnValueOnce(new Promise(resolve => (finishSending = () => resolve('zd-1'))))

    const first = send()
    await vi.waitFor(() => expect(sendLegalReply).toHaveBeenCalledTimes(1))
    const second = await send()
    finishSending()

    expect(second).toEqual({ blocker: ALREADY_SENDING })
    expect((await first).reply).toBeDefined()
    expect(sendLegalReply).toHaveBeenCalledTimes(1)
  })

  it('says when the reply went out but could not be recorded', async () => {
    saveLegalReply.mockRejectedValue(new Error('db down'))

    expect(await send()).toEqual({
      reply: { id: null, sentBy: 'ana@example.com', text: 'Hello', sentAt: expect.any(String) },
      warning: SENT_NOT_RECORDED,
    })
  })
})
