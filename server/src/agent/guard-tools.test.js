import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@openai/agents', () => ({
  tool: vi.fn(options => options),
}))

const checkContent = vi.fn()
const checkTicketReply = vi.fn()
vi.mock('../guards/check.js', () => ({ checkContent, checkTicketReply }))

const getOwnedLegalCase = vi.fn()
vi.mock('../db/legal-cases.js', () => ({ getOwnedLegalCase }))

const findUserById = vi.fn()
vi.mock('../db/users.js', () => ({ findUserById }))

const sendCaseReply = vi.fn()
vi.mock('../legal/send.js', async importOriginal => ({ ...(await importOriginal()), sendCaseReply }))

const { buildGuardTools } = await import('./guard-tools.js')
const { LegalReplyError } = await import('../legal/replies.js')

const GUARDS = [
  { id: 'legal', name: 'Legal' },
  { id: 'guard-0a1b2c3d', name: 'Refunds' },
]
const ROWS = [
  { question: 'Is it unusual?', answer: 'Yes', confidence: 0.9, flagged: true, unsure: false },
  { question: 'Does it match the data?', answer: null, confidence: 0.4, flagged: false, unsure: true },
  { question: 'Is it safe?', answer: 'Yes', confidence: 0.95, flagged: false, unsure: false },
]
const TICKET = {
  source: 'zendesk',
  ticketId: '48213',
  subject: 'Your refund',
  body: 'We issued it.',
  language: 'en',
  dataFacts: [{ fact: 'Refund issued', source: 'database' }],
}

function askGuard(options = {}) {
  const [guardTool] = buildGuardTools({ guards: GUARDS, userId: 3, ...options })
  return guardTool
}

beforeEach(() => {
  vi.clearAllMocks()
  checkContent.mockResolvedValue({ guard: 'Legal', warnings: 2, review: { rows: ROWS } })
  checkTicketReply.mockResolvedValue({
    id: 41,
    guard: 'Legal',
    reviews: [{ guard: 'Legal', warnings: 0, review: { rows: [ROWS[2]] } }],
  })
})

describe('ask_guard', () => {
  it('lists the guards and asks to use them only when asked, every guard whose name matches', () => {
    const { name, description } = askGuard()

    expect(name).toBe('ask_guard')
    expect(description).toContain(
      'Use guards only when the user, a scheduled query or the instructions of a bot ask for them'
    )
    expect(description).toContain('Never use a guard on your own.')
    expect(description).toContain('Guards:\n- "Legal"\n- "Refunds"')
  })

  it('checks content with the guard named, in any case', async () => {
    const onChecked = vi.fn()

    const answer = await askGuard({ guardCases: { conversationId: 'conv-1', onChecked } }).execute({
      guards: [' legal '],
      content: 'Can we refund in 2 days?',
      ticket: null,
    })

    expect(checkContent).toHaveBeenCalledWith(GUARDS[0], 'Can we refund in 2 days?')
    expect(answer).toBe(
      [
        'The Legal guard raised 2 warnings.',
        '- Is it unusual?: Yes (confidence 0.90) [warning]',
        '- Does it match the data?: no answer (confidence 0.40) [not sure]',
        '- Is it safe?: Yes (confidence 0.95)',
      ].join('\n')
    )
    expect(onChecked).toHaveBeenCalledWith({ kind: 'check', check: expect.objectContaining({ guard: 'Legal' }) })
  })

  it('passes content through every guard named, once each', async () => {
    checkContent.mockImplementation(async guard => ({ guard: guard.name, warnings: 0, review: { rows: [] } }))

    const answer = await askGuard().execute({ guards: ['Legal', 'refunds', 'LEGAL'], content: 'x', ticket: null })

    expect(checkContent.mock.calls.map(([guard]) => guard.name)).toEqual(['Legal', 'Refunds'])
    expect(answer).toBe('The Legal guard found no warnings.\n\nThe Refunds guard found no warnings.')
  })

  it('says when the guard could not check it', async () => {
    checkContent.mockResolvedValue({ guard: 'Legal', warnings: 0, review: null, reason: 'the review could not run' })

    expect(await askGuard().execute({ guards: ['Legal'], content: 'Anything', ticket: null })).toBe(
      'The Legal guard could not check it: the review could not run.'
    )
  })

  it('checks a ticket reply, shows the case in the web chat and says so', async () => {
    const onChecked = vi.fn()
    const guardCases = { conversationId: 'conv-1', onChecked }

    const answer = await askGuard({ guardCases }).execute({ guards: ['Legal'], content: null, ticket: TICKET })

    expect(checkTicketReply).toHaveBeenCalledWith([GUARDS[0]], {
      userId: 3,
      ticket: { source: 'zendesk', ticketId: '48213' },
      reply: {
        draft: { subject: 'Your refund', body: 'We issued it.' },
        dataFacts: TICKET.dataFacts,
        language: 'en',
      },
      cases: guardCases,
    })
    expect(onChecked).toHaveBeenCalledWith({ kind: 'case', case: expect.objectContaining({ id: 41 }) })
    expect(answer).toBe(
      'The Legal guard found no warnings.\n- Is it safe?: Yes (confidence 0.95)\n\nThe user sees case 41 with the draft and the review of each guard. When the user asks you to send it, call send_case_reply with case 41; to change it or add data first, check the new draft again with the same guards.'
    )
  })

  it('points to the web chat to send a reply checked from Slack or MCP', async () => {
    const answer = await askGuard().execute({ guards: ['Legal'], content: null, ticket: TICKET })

    expect(answer).toMatch(/Sending is only possible from the Soporti web chat/)
  })

  it('says when the ticket cannot be read', async () => {
    checkTicketReply.mockResolvedValue(null)

    expect(await askGuard().execute({ guards: ['Legal'], content: null, ticket: TICKET })).toMatch(
      /^Could not read that ticket/
    )
  })

  it('needs something to check and a guard that exists', async () => {
    expect(await askGuard().execute({ guards: ['Legal'], content: '  ', ticket: null })).toMatch(/^Pass `content`/)
    expect(await askGuard().execute({ guards: ['Legal', 'Payments'], content: 'x', ticket: null })).toBe(
      'There is no guard called "Payments". Guards: Legal, Refunds.'
    )
    expect(checkContent).not.toHaveBeenCalled()
  })

  it('sends a case only from the web chat', () => {
    expect(buildGuardTools({ guards: GUARDS, userId: 3 }).map(({ name }) => name)).toEqual(['ask_guard'])
    expect(
      buildGuardTools({ guards: GUARDS, userId: 3, guardCases: { sendable: true } }).map(({ name }) => name)
    ).toEqual(['ask_guard', 'send_case_reply'])
  })
})

describe('send_case_reply', () => {
  const CASE = { id: 41, source: 'zendesk', ticketId: '48213', status: 'checked', warnings: 0 }
  const USER = { id: 3, email: 'ana@example.com' }

  function sendTool() {
    return buildGuardTools({ guards: GUARDS, userId: 3, guardCases: { sendable: true } })[1]
  }

  beforeEach(() => {
    getOwnedLegalCase.mockResolvedValue(CASE)
    findUserById.mockResolvedValue(USER)
    sendCaseReply.mockResolvedValue({ reply: { id: 7 } })
  })

  it('asks to be used only when the user asks to send, after confirming any warning', () => {
    const { description } = sendTool()

    expect(description).toContain('only when the user asks you in this conversation to send it')
    expect(description).toContain('send it only after they confirm they read them')
  })

  it('sends the reply the user approved as the user, through the ticket of the case', async () => {
    const answer = await sendTool().execute({ caseId: 41, text: ' Hello ', warningsConfirmed: false })

    expect(getOwnedLegalCase).toHaveBeenCalledWith(41, 3)
    expect(sendCaseReply).toHaveBeenCalledWith({ legalCase: CASE, user: USER, text: 'Hello', warningsRead: false })
    expect(answer).toBe('Sent to the Zendesk ticket 48213 as ana@example.com.')
  })

  it('says why it did not send', async () => {
    sendCaseReply.mockResolvedValueOnce({ blocker: 'Sending from Soporti is off.' })
    sendCaseReply.mockResolvedValueOnce({ unconfirmed: 'Confirm' })
    sendCaseReply.mockRejectedValueOnce(new LegalReplyError('Zendesk did not take the reply.'))
    const input = { caseId: 41, text: 'Hello', warningsConfirmed: false }

    expect(await sendTool().execute(input)).toBe('Not sent: Sending from Soporti is off.')
    expect(await sendTool().execute(input)).toMatch(/^Not sent: this case has warnings or was not checked/)
    expect(await sendTool().execute(input)).toBe('Not sent: Zendesk did not take the reply.')
    expect(await sendTool().execute({ ...input, text: ' ' })).toBe('Not sent: The reply is empty.')
  })

  it('says when the reply went out but could not be recorded, and when the case is not there', async () => {
    sendCaseReply.mockResolvedValueOnce({ reply: { id: null }, warning: 'Check the ticket.' })

    expect(await sendTool().execute({ caseId: 41, text: 'Hello', warningsConfirmed: true })).toBe(
      'Sent to the Zendesk ticket 48213 as ana@example.com. Check the ticket.'
    )

    getOwnedLegalCase.mockResolvedValueOnce(null)
    expect(await sendTool().execute({ caseId: 99, text: 'Hello', warningsConfirmed: true })).toBe(
      'There is no case with that id in this conversation.'
    )
  })
})
