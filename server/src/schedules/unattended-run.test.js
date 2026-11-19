import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@openai/agents', () => ({
  run: vi.fn(),
  withTrace: vi.fn((_name, runAgent) => runAgent()),
}))
vi.mock('../config.js', () => ({ default: { schedules: { maxTurns: 30 } } }))
vi.mock('../llm/model.js', () => ({ resolveModelForAgent: vi.fn() }))
vi.mock('../agent/assistant.js', () => ({ createAgent: vi.fn() }))
vi.mock('../db/users.js', () => ({ getCustomInstructions: vi.fn() }))
vi.mock('../db/agent-runs.js', () => ({ recordAgentRun: vi.fn() }))

const { run, withTrace } = await import('@openai/agents')
const { createAgent } = await import('../agent/assistant.js')
const { getCustomInstructions } = await import('../db/users.js')
const { loadCustomInstructions, runUnattended } = await import('./unattended-run.js')

const TASK = {
  sources: ['yolo'],
  profile: 'tech',
  userId: 7,
  timezone: 'Europe/Madrid',
  bot: { name: 'Ticket triager', description: 'Triage tickets.' },
  customInstructions: null,
  input: 'Review the new tickets.',
  question: 'Review the new tickets.',
}

beforeEach(() => {
  vi.clearAllMocks()
  createAgent.mockResolvedValue({ name: 'agent', clone: vi.fn() })
  run.mockResolvedValue({
    finalOutput: 'Closed 3 tickets.',
    newItems: [{ type: 'tool_call_item', rawItem: { name: 'zendesk_search_tickets', arguments: '{}' } }],
  })
})

describe('runUnattended', () => {
  it('builds an unattended agent with the role of the bot and runs it without a session', async () => {
    await runUnattended(TASK, { conversationId: 'bot-conversation' })

    expect(createAgent).toHaveBeenCalledWith(['yolo'], 'tech', {
      customInstructions: '',
      userId: 7,
      onNestedToolCall: expect.any(Function),
      onNestedUsage: expect.any(Function),
      unattended: true,
      timezone: 'Europe/Madrid',
      bot: { name: 'Ticket triager', description: 'Triage tickets.' },
    })
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ name: 'agent' }), 'Review the new tickets.', {
      maxTurns: 30,
      session: undefined,
      toolNotFoundBehavior: 'return_error_to_model',
      errorHandlers: { maxTurns: expect.any(Function) },
    })
    expect(withTrace).toHaveBeenCalledWith('Agent workflow', expect.any(Function), {
      metadata: { sessionId: 'bot-conversation', userId: '7', question: 'Review the new tickets.' },
    })
  })

  it('runs a read-only copy of the agent with the structured output when one is asked for', async () => {
    const readOnly = { name: 'read-only agent' }
    const clone = vi.fn().mockReturnValue(readOnly)
    createAgent.mockResolvedValue({
      name: 'agent',
      tools: [{ name: 'zendesk_get_ticket' }, { name: 'zendesk_post_internal_note' }, { name: 'post_slack_message' }],
      clone,
    })
    const schema = { parse: vi.fn() }
    run.mockResolvedValue({ finalOutput: { tickets: [] }, newItems: [] })

    const { result } = await runUnattended({ ...TASK, readOnlyOutputType: schema })

    expect(clone).toHaveBeenCalledWith({ tools: [{ name: 'zendesk_get_ticket' }], outputType: schema })
    expect(run.mock.calls[0][0]).toBe(readOnly)
    expect(result.finalOutput).toEqual({ tickets: [] })
  })

  it('returns the bare answer apart from the text with the consulted sources', async () => {
    const outcome = await runUnattended(TASK)

    expect(outcome.answer).toBe('Closed 3 tickets.')
    expect(outcome.text).toBe('Closed 3 tickets.\n\n---\n_Sources consulted: Zendesk_')
    expect(outcome.wrappedUp).toBe(false)
  })

  it('credits what a specialist consulted and spent to the run', async () => {
    const { recordAgentRun } = await import('../db/agent-runs.js')
    run.mockImplementation(async () => {
      const [, , options] = createAgent.mock.calls[0]
      options.onNestedToolCall({ name: 'search_notion_pages', arguments: '{}' })
      options.onNestedUsage({ requests: 1, inputTokens: 100, outputTokens: 10 })
      return { finalOutput: 'Found it.', newItems: [] }
    })

    const outcome = await runUnattended(TASK)

    expect(outcome.text).toBe('Found it.\n\n---\n_Sources consulted: Notion_')
    expect(recordAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({ tools: ['search_notion_pages'], usage: expect.objectContaining({ inputTokens: 100 }) })
    )
  })

  it('throws when the answer is empty', async () => {
    run.mockResolvedValue({ finalOutput: '' })

    await expect(runUnattended(TASK)).rejects.toThrow('The assistant returned an empty answer.')
  })
})

describe('loadCustomInstructions', () => {
  it('returns the instructions of the user', async () => {
    getCustomInstructions.mockResolvedValue('Be brief.')

    expect(await loadCustomInstructions(7)).toBe('Be brief.')
    expect(getCustomInstructions).toHaveBeenCalledWith(7)
  })

  it('logs and returns null when they cannot be loaded', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    getCustomInstructions.mockRejectedValue(new Error('db down'))

    expect(await loadCustomInstructions(7)).toBeNull()
    expect(consoleError).toHaveBeenCalledWith('[schedules] Failed to load custom instructions:', 'db down')
    consoleError.mockRestore()
  })
})
