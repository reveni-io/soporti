import { describe, it, expect, vi, beforeEach } from 'vitest'

const runUnattended = vi.fn()
const loadCustomInstructions = vi.fn()
vi.mock('../schedules/unattended-run.js', () => ({ runUnattended, loadCustomInstructions }))

const readLegalTickets = vi.fn()
vi.mock('./tickets.js', async importOriginal => ({ ...(await importOriginal()), readLegalTickets }))

const findDraftedLegalCases = vi.fn()
const saveLegalCase = vi.fn()
const deleteLegalCases = vi.fn()
vi.mock('../db/legal-cases.js', async importOriginal => ({
  ...(await importOriginal()),
  findDraftedLegalCases,
  saveLegalCase,
  deleteLegalCases,
}))

const runJevCheck = vi.fn()
vi.mock('../jev/check.js', () => ({ runJevCheck }))

const { runLegalSchedule } = await import('./runner.js')

const SCHEDULE = {
  id: 3,
  userId: 7,
  question: 'Draft replies to the customer tickets Legal received yesterday',
  sources: ['integration:zendesk', 'database'],
  profile: 'support',
  timezone: 'Europe/Madrid',
}
const DRAFT = {
  dataFacts: [{ fact: 'Refund of 49.90 EUR issued on 15 Nov', source: 'database' }],
  draft: { subject: 'Your refund', body: 'Hello, we issued your refund.' },
  language: 'en',
}
const logger = { error: vi.fn() }

function ticket(ticketId, overrides = {}) {
  return {
    source: 'zendesk',
    ticketId,
    url: `https://acme.zendesk.com/agent/tickets/${ticketId}`,
    subject: 'Refund',
    customer: 'customer@example.com',
    customerMessage: 'Where is my refund?',
    messageHash: `hash-${ticketId}`,
    ...overrides,
  }
}

function store() {
  return {
    createScheduled: vi.fn().mockResolvedValue({ conversationId: 'conv-1', session: 'session-1' }),
    saveTurn: vi.fn().mockResolvedValue(),
    deleteWeb: vi.fn().mockResolvedValue(),
  }
}

function findsTickets(refs) {
  runUnattended.mockImplementation(async task => {
    if (task.input.startsWith('## Legal: find the tickets')) return { result: { finalOutput: { tickets: refs } } }
    return { result: { finalOutput: DRAFT } }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  loadCustomInstructions.mockResolvedValue('Be brief.')
  findDraftedLegalCases.mockResolvedValue(new Set())
  saveLegalCase.mockResolvedValue()
  deleteLegalCases.mockResolvedValue()
  runJevCheck.mockResolvedValue({
    status: 'answered',
    setVersion: 7,
    model: 'jev-1.13.0',
    minConfidence: 0.7,
    rows: [{ questionId: 'l1', question: 'Unusual?', answer: 'Yes', confidence: 0.94, flagged: true, unsure: false }],
  })
})

describe('runLegalSchedule', () => {
  it('finds the tickets, drafts each reply, checks it with Jev and saves the cases in the conversation', async () => {
    findsTickets([{ source: 'zendesk', ticketId: '48213' }])
    readLegalTickets.mockResolvedValue([ticket('48213')])
    const conversations = store()

    const result = await runLegalSchedule(SCHEDULE, conversations, { logger })

    expect(result).toEqual({ conversationId: 'conv-1', cases: 1 })
    const [findTask, conversation] = runUnattended.mock.calls[0]
    expect(findTask).toMatchObject({
      sources: SCHEDULE.sources,
      profile: 'support',
      userId: 7,
      timezone: 'Europe/Madrid',
      customInstructions: 'Be brief.',
      question: SCHEDULE.question,
    })
    expect(findTask.readOnlyOutputType).toBeDefined()
    expect(conversation).toEqual({ session: 'session-1', conversationId: 'conv-1' })
    expect(readLegalTickets).toHaveBeenCalledWith(7, [{ source: 'zendesk', ticketId: '48213' }], { logger })

    const [draftTask, draftConversation] = runUnattended.mock.calls[1]
    expect(draftTask.input).toContain('> Where is my refund?')
    expect(draftConversation).toBeUndefined()

    expect(runJevCheck).toHaveBeenCalledWith({
      project: 'legal',
      state: {
        ticket: { source: 'zendesk', subject: 'Refund', customer: 'customer@example.com' },
        customerMessage: 'Where is my refund?',
        dataFacts: DRAFT.dataFacts,
        draft: DRAFT.draft,
        language: 'en',
      },
    })

    const legalCase = {
      source: 'zendesk',
      ticketId: '48213',
      ticketUrl: 'https://acme.zendesk.com/agent/tickets/48213',
      customer: 'customer@example.com',
      subject: 'Refund',
      customerMessage: 'Where is my refund?',
      ...DRAFT,
      status: 'checked',
      reason: null,
      setVersion: 7,
      jev: {
        setVersion: 7,
        model: 'jev-1.13.0',
        minConfidence: 0.7,
        rows: [
          { questionId: 'l1', question: 'Unusual?', answer: 'Yes', confidence: 0.94, flagged: true, unsure: false },
        ],
      },
      warnings: 1,
    }
    expect(saveLegalCase).toHaveBeenCalledWith({
      ...legalCase,
      scheduleId: 3,
      conversationId: 'conv-1',
      messageHash: 'hash-48213',
    })

    const [conversationId, turn] = conversations.saveTurn.mock.calls[0]
    expect(conversationId).toBe('conv-1')
    expect(turn.lastResponseId).toBeNull()
    expect(turn.uiMessages[0]).toEqual({ role: 'user', parts: [{ type: 'text', content: SCHEDULE.question }] })
    expect(turn.uiMessages[1].parts[0].content).toContain('Found **1 customer ticket** to answer.')
    const { jev, ...chatCase } = legalCase
    expect(turn.uiMessages[1].parts[1]).toEqual({
      type: 'legal-run',
      cases: [{ ...chatCase, review: { setVersion: 7, minConfidence: 0.7, rows: jev.rows } }],
    })
    expect(JSON.stringify(turn.uiMessages)).not.toMatch(/jev/i)
  })

  it('does not draft the tickets it already drafted for the same customer message', async () => {
    findsTickets([])
    readLegalTickets.mockResolvedValue([ticket('1'), ticket('2')])
    findDraftedLegalCases.mockResolvedValue(new Set(['zendesk:1:hash-1']))
    const conversations = store()

    await runLegalSchedule(SCHEDULE, conversations, { logger })

    expect(findDraftedLegalCases).toHaveBeenCalledWith(3, [ticket('1'), ticket('2')])
    expect(saveLegalCase).toHaveBeenCalledTimes(1)
    expect(saveLegalCase.mock.calls[0][0].ticketId).toBe('2')
  })

  it('drafts at most twenty tickets per run and leaves the rest for the next one', async () => {
    findsTickets([])
    readLegalTickets.mockResolvedValue(Array.from({ length: 22 }, (_, index) => ticket(String(index))))
    const conversations = store()

    const { cases } = await runLegalSchedule(SCHEDULE, conversations, { logger })

    expect(cases).toBe(20)
    expect(conversations.saveTurn.mock.calls[0][1].uiMessages[1].parts[0].content).toContain(
      '2 more tickets will be drafted in the next run.'
    )
  })

  it('says when there is nothing new to answer', async () => {
    runUnattended.mockResolvedValue({ result: { finalOutput: 'not structured' } })
    readLegalTickets.mockResolvedValue([])
    const conversations = store()

    await runLegalSchedule(SCHEDULE, conversations, { logger })

    expect(readLegalTickets).toHaveBeenCalledWith(7, [], { logger })
    expect(conversations.saveTurn.mock.calls[0][1].uiMessages[1].parts).toEqual([
      { type: 'text', content: 'No new customer tickets to answer for this query.' },
    ])
  })

  it('keeps the draft but marks the case not checked when Jev cannot answer', async () => {
    findsTickets([])
    readLegalTickets.mockResolvedValue([ticket('1')])
    runJevCheck.mockResolvedValue({ status: 'unavailable', setVersion: 7, reason: 'Daily limit exceeded (50 calls)' })

    await runLegalSchedule(SCHEDULE, store(), { logger })

    expect(saveLegalCase.mock.calls[0][0]).toMatchObject({
      draft: DRAFT.draft,
      status: 'not_checked',
      reason: 'Daily limit exceeded (50 calls)',
      setVersion: 7,
      jev: null,
      warnings: 0,
    })
  })

  it('tells the chat that the review could not run without naming the service behind it', async () => {
    findsTickets([])
    readLegalTickets.mockResolvedValue([ticket('1')])
    runJevCheck.mockResolvedValue({ status: 'unavailable', setVersion: 7, reason: 'Jev error (HTTP 502)' })
    const conversations = store()

    await runLegalSchedule(SCHEDULE, conversations, { logger })

    expect(saveLegalCase.mock.calls[0][0].reason).toBe('Jev error (HTTP 502)')
    const [chatCase] = conversations.saveTurn.mock.calls[0][1].uiMessages[1].parts[1].cases
    expect(chatCase).toMatchObject({ status: 'not_checked', reason: 'the review could not run', review: null })
  })

  it.each([
    [
      'an incomplete draft',
      () => ({ result: { finalOutput: { draft: {} } } }),
      'Draft failed (the reply came back incomplete)',
    ],
    [
      'a failed draft',
      () => {
        throw new Error('model down')
      },
      'Draft failed (the agent could not finish it)',
    ],
  ])('marks a case not checked after %s, without asking Jev', async (_case, draft, reason) => {
    runUnattended.mockImplementation(async task => {
      if (task.input.startsWith('## Legal: find the tickets')) return { result: { finalOutput: { tickets: [] } } }
      return draft()
    })
    readLegalTickets.mockResolvedValue([ticket('1')])

    await runLegalSchedule(SCHEDULE, store(), { logger })

    expect(saveLegalCase.mock.calls[0][0]).toMatchObject({
      status: 'not_checked',
      reason,
      setVersion: null,
      draft: null,
      dataFacts: null,
    })
    expect(runJevCheck).not.toHaveBeenCalled()
  })

  it('removes the saved cases with the conversation when the run cannot be saved, so they are drafted again', async () => {
    findsTickets([])
    readLegalTickets.mockResolvedValue([ticket('1')])
    const conversations = store()
    conversations.saveTurn.mockRejectedValue(new Error('db down'))

    await expect(runLegalSchedule(SCHEDULE, conversations, { logger })).rejects.toThrow('db down')
    expect(saveLegalCase).toHaveBeenCalledTimes(1)
    expect(deleteLegalCases).toHaveBeenCalledWith('conv-1')
    expect(conversations.deleteWeb).toHaveBeenCalledWith('conv-1', 7)
  })

  it('removes the conversation and fails when the tickets cannot be found', async () => {
    runUnattended.mockRejectedValue(new Error('Zendesk is down'))
    const conversations = store()
    conversations.deleteWeb.mockRejectedValue(new Error('db down'))

    await expect(runLegalSchedule(SCHEDULE, conversations, { logger })).rejects.toThrow('Zendesk is down')
    expect(conversations.deleteWeb).toHaveBeenCalledWith('conv-1', 7)
    expect(logger.error).toHaveBeenCalledWith('[legal] Failed to clean up a failed run:', 'db down')
  })
})
