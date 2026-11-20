import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@openai/agents', () => ({
  tool: vi.fn(options => options),
}))

const checkContent = vi.fn()
const checkTicketReply = vi.fn()
vi.mock('../guards/check.js', () => ({ checkContent, checkTicketReply }))

const { buildGuardTools } = await import('./guard-tools.js')

const GUARDS = [
  { id: 'legal', name: 'Legal', description: 'Replies to customers' },
  { id: 'guard-0a1b2c3d', name: 'Refunds', description: '' },
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
    expect(description).toContain('- "Legal": Replies to customers\n- "Refunds"')
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
      'The Legal guard found no warnings.\n- Is it safe?: Yes (confidence 0.95)\n\nThe user sees the case with the reply, the warnings and a Send button.'
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
})
