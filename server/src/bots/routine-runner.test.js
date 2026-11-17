import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db/bots.js', () => ({ getBot: vi.fn(), incrementBotUnread: vi.fn() }))
vi.mock('../db/routines.js', () => ({ storeRoutineResult: vi.fn() }))
vi.mock('../schedules/unattended-run.js', () => ({ loadCustomInstructions: vi.fn(), runUnattended: vi.fn() }))

const { getBot, incrementBotUnread } = await import('../db/bots.js')
const { storeRoutineResult } = await import('../db/routines.js')
const { loadCustomInstructions, runUnattended } = await import('../schedules/unattended-run.js')
const { runBotRoutine } = await import('./routine-runner.js')

const NOW = new Date('2026-11-17T16:00:30Z')
const BOT = { id: 4, name: 'Ticket triager', description: 'Triage the new Zendesk tickets.', profile: 'tech' }
const SESSION = { id: 'bot-session' }

const ROUTINE = {
  id: 9,
  userId: 7,
  botId: 4,
  title: 'Ticket triage',
  question: 'Review the new Zendesk tickets and tag the urgent ones.',
  sources: ['yolo'],
  profile: 'support',
  frequency: 'weekdays',
  minute: 0,
  hour: 17,
  weekday: null,
  monthDay: null,
  runDate: null,
  timezone: 'Europe/Madrid',
  lastRunAt: new Date('2026-11-16T16:00:00Z'),
  lastResult: 'Two urgent tickets, both tagged.',
}

function makeStore() {
  return {
    resolveBot: vi.fn().mockResolvedValue({ conversationId: 'bot-conversation', session: SESSION }),
    saveTurn: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  getBot.mockResolvedValue(BOT)
  incrementBotUnread.mockResolvedValue(undefined)
  storeRoutineResult.mockResolvedValue(undefined)
  loadCustomInstructions.mockResolvedValue('Be brief.')
  runUnattended.mockResolvedValue({
    answer: 'Three new tickets, one urgent.',
    text: 'Three new tickets, one urgent.\n\n---\n_Sources consulted: Zendesk_',
    wrappedUp: false,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('runBotRoutine', () => {
  it('runs the routine unattended as the bot, in yolo mode with the bot profile and without a session', async () => {
    await runBotRoutine(ROUTINE, makeStore())

    expect(getBot).toHaveBeenCalledWith(4, 7)
    expect(runUnattended).toHaveBeenCalledTimes(1)
    const [task, options] = runUnattended.mock.calls[0]
    expect(task).toMatchObject({
      sources: ['yolo'],
      profile: 'tech',
      userId: 7,
      timezone: 'Europe/Madrid',
      bot: { name: 'Ticket triager', description: 'Triage the new Zendesk tickets.' },
      customInstructions: 'Be brief.',
      question: 'Review the new Zendesk tickets and tag the urgent ones.',
    })
    expect(task.bot).not.toHaveProperty('id')
    expect(options).toEqual({ conversationId: 'bot-conversation' })
  })

  it('hands the run its instruction, schedule and previous report', async () => {
    await runBotRoutine(ROUTINE, makeStore())

    const [{ input }] = runUnattended.mock.calls[0]
    expect(input).toContain('## Routine: Ticket triage')
    expect(input).toContain('It runs every weekday at 17:00 (Europe/Madrid).')
    expect(input).toContain('Review the new Zendesk tickets and tag the urgent ones.')
    expect(input).toContain('The previous run was on Monday 2026-11-16 at 17:00 (Europe/Madrid).')
    expect(input).toContain('> Two urgent tickets, both tagged.')
    expect(input).toContain('NOTHING_TO_REPORT')
  })

  it('tells the first run that it is the first one', async () => {
    await runBotRoutine({ ...ROUTINE, lastRunAt: null, lastResult: null }, makeStore())

    expect(runUnattended.mock.calls[0][0].input).toContain('This is the first run of this routine.')
  })

  it('posts the report into the bot chat and keeps it in the session for follow-ups', async () => {
    const store = makeStore()

    expect(await runBotRoutine(ROUTINE, store)).toEqual({ posted: true })

    expect(store.resolveBot).toHaveBeenCalledWith(4, 7)
    expect(store.saveTurn).toHaveBeenCalledTimes(1)
    expect(store.saveTurn).toHaveBeenCalledWith('bot-conversation', {
      lastResponseId: null,
      session: SESSION,
      unpersistedItems: [
        {
          type: 'message',
          role: 'user',
          content:
            '[Routine "Ticket triage" ran at Tuesday 2026-11-17 at 17:00 (Europe/Madrid). Its instruction: Review the new Zendesk tickets and tag the urgent ones.]',
        },
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'Three new tickets, one urgent.' }],
        },
      ],
      uiMessages: [
        {
          role: 'assistant',
          parts: [
            { type: 'routine', routineId: 9, title: 'Ticket triage' },
            { type: 'text', content: 'Three new tickets, one urgent.\n\n---\n_Sources consulted: Zendesk_' },
          ],
        },
      ],
    })
    expect(incrementBotUnread).toHaveBeenCalledWith(4)
    expect(storeRoutineResult).toHaveBeenCalledWith(9, 'Three new tickets, one urgent.')
  })

  it('keeps at most 4000 characters of the report for the next run and the session, and all of it in the chat', async () => {
    const store = makeStore()
    runUnattended.mockResolvedValue({ answer: 'x'.repeat(5000), text: 'x'.repeat(5000), wrappedUp: false })

    await runBotRoutine(ROUTINE, store)

    const [, { unpersistedItems, uiMessages }] = store.saveTurn.mock.calls[0]
    expect(storeRoutineResult.mock.calls[0][1]).toHaveLength(4000)
    expect(unpersistedItems[1].content[0].text).toHaveLength(4000)
    expect(uiMessages[0].parts[1].content).toHaveLength(5000)
  })

  it.each([['NOTHING_TO_REPORT'], ['  `NOTHING_TO_REPORT`.  '], ['**NOTHING_TO_REPORT**']])(
    'stays silent when the run answers %s',
    async answer => {
      const store = makeStore()
      runUnattended.mockResolvedValue({ answer, text: answer, wrappedUp: false })

      expect(await runBotRoutine(ROUTINE, store)).toEqual({ posted: false })

      expect(store.saveTurn).not.toHaveBeenCalled()
      expect(incrementBotUnread).not.toHaveBeenCalled()
      expect(storeRoutineResult).not.toHaveBeenCalled()
    }
  )

  it('says in the chat that the routine failed, without the raw error, and rethrows', async () => {
    const store = makeStore()
    runUnattended.mockRejectedValue(new Error('Zendesk 503: upstream secret leaked'))

    await expect(runBotRoutine(ROUTINE, store)).rejects.toThrow('Zendesk 503')

    expect(store.saveTurn).toHaveBeenCalledTimes(1)
    expect(store.saveTurn).toHaveBeenCalledWith('bot-conversation', {
      lastResponseId: null,
      session: SESSION,
      unpersistedItems: [],
      uiMessages: [
        {
          role: 'assistant',
          parts: [
            { type: 'routine', routineId: 9, title: 'Ticket triage' },
            {
              type: 'error',
              content: 'I could not run this routine. I will try again at its next scheduled time.',
            },
          ],
        },
      ],
    })
    expect(incrementBotUnread).toHaveBeenCalledWith(4)
    expect(storeRoutineResult).not.toHaveBeenCalled()
  })

  it('does not promise another try for a one-off routine', async () => {
    const store = makeStore()
    runUnattended.mockRejectedValue(new Error('model unavailable'))

    await expect(runBotRoutine({ ...ROUTINE, frequency: 'once', runDate: '2026-11-17' }, store)).rejects.toThrow()

    const [, { uiMessages }] = store.saveTurn.mock.calls[0]
    expect(uiMessages[0].parts[1]).toEqual({ type: 'error', content: 'I could not run this routine.' })
  })

  it('still rethrows the run failure when the chat cannot be told', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = makeStore()
    store.saveTurn.mockRejectedValue(new Error('db down'))
    runUnattended.mockRejectedValue(new Error('model unavailable'))

    await expect(runBotRoutine(ROUTINE, store)).rejects.toThrow('model unavailable')

    expect(consoleError).toHaveBeenCalledWith(
      '[bots] Failed to report a failed routine run in the chat:',
      expect.objectContaining({ message: 'db down' })
    )
    consoleError.mockRestore()
  })

  it('fails without running anything when the bot no longer exists', async () => {
    const store = makeStore()
    getBot.mockResolvedValue(null)

    await expect(runBotRoutine(ROUTINE, store)).rejects.toThrow('Bot 4 was not found.')

    expect(runUnattended).not.toHaveBeenCalled()
    expect(store.saveTurn).not.toHaveBeenCalled()
  })
})
