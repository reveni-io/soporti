import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@openai/agents', () => ({ run: vi.fn() }))
vi.mock('../agent/assistant.js', () => ({ createAgent: vi.fn() }))
vi.mock('../knowledge/client.js', () => ({ searchSimilarCases: vi.fn() }))
vi.mock('../db/users.js', () => ({ getCustomInstructions: vi.fn() }))

const { run } = await import('@openai/agents')
const { createAgent } = await import('../agent/assistant.js')
const { searchSimilarCases } = await import('../knowledge/client.js')
const { getCustomInstructions } = await import('../db/users.js')
const { runSchedule } = await import('./runner.js')

const SCHEDULE = {
  id: 3,
  userId: 7,
  question: 'Failed payments in the last 24h',
  sources: ['yolo'],
  profile: 'support',
}

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111'

function makeStore() {
  return {
    createScheduled: vi.fn().mockResolvedValue({ conversationId: CONVERSATION_ID, session: { id: 'session' } }),
    saveTurn: vi.fn().mockResolvedValue(undefined),
    deleteWeb: vi.fn().mockResolvedValue(true),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  createAgent.mockResolvedValue({ name: 'agent' })
  searchSimilarCases.mockResolvedValue([])
  getCustomInstructions.mockResolvedValue('Be brief.')
  run.mockResolvedValue({ finalOutput: 'Two payments failed.', lastResponseId: 'resp_1', newItems: [] })
})

describe('runSchedule', () => {
  it('stores the question and the answer in a conversation of its own', async () => {
    const store = makeStore()

    const result = await runSchedule(SCHEDULE, store)

    expect(result).toEqual({ conversationId: CONVERSATION_ID })
    expect(store.createScheduled).toHaveBeenCalledWith(7, 3)
    expect(store.saveTurn).toHaveBeenCalledWith(CONVERSATION_ID, {
      lastResponseId: 'resp_1',
      session: { id: 'session' },
      uiMessages: [
        { role: 'user', parts: [{ type: 'text', content: 'Failed payments in the last 24h' }] },
        { role: 'assistant', parts: [{ type: 'text', content: 'Two payments failed.' }] },
      ],
    })
  })

  it('builds the agent with the sources, profile and custom instructions of the schedule', async () => {
    const store = makeStore()
    searchSimilarCases.mockResolvedValue([{ id: 'case_1' }])

    await runSchedule({ ...SCHEDULE, sources: ['reveni-io/soporti'], profile: 'tech' }, store)

    expect(createAgent).toHaveBeenCalledWith(['reveni-io/soporti'], 'tech', [{ id: 'case_1' }], {
      customInstructions: 'Be brief.',
    })
    expect(run).toHaveBeenCalledWith({ name: 'agent' }, 'Failed payments in the last 24h', {
      maxTurns: expect.any(Number),
      session: { id: 'session' },
    })
  })

  it('appends the consulted sources in yolo mode', async () => {
    const store = makeStore()
    run.mockResolvedValue({
      finalOutput: 'Two payments failed.',
      newItems: [{ type: 'tool_call_item', rawItem: { name: 'search_notion_pages', arguments: '{}' } }],
    })

    await runSchedule(SCHEDULE, store)

    const [, turn] = store.saveTurn.mock.calls[0]
    expect(turn.uiMessages[1].parts[0].content).toBe('Two payments failed.\n\n---\n_Sources consulted: Notion_')
  })

  it('does not append the consulted sources when specific sources were selected', async () => {
    const store = makeStore()
    run.mockResolvedValue({
      finalOutput: 'Two payments failed.',
      newItems: [{ type: 'tool_call_item', rawItem: { name: 'search_notion_pages', arguments: '{}' } }],
    })

    await runSchedule({ ...SCHEDULE, sources: ['integration:notion'] }, store)

    const [, turn] = store.saveTurn.mock.calls[0]
    expect(turn.uiMessages[1].parts[0].content).toBe('Two payments failed.')
  })

  it('runs without custom instructions when they cannot be loaded', async () => {
    const store = makeStore()
    getCustomInstructions.mockRejectedValue(new Error('db down'))

    await runSchedule(SCHEDULE, store)

    expect(createAgent).toHaveBeenCalledWith(['yolo'], 'support', [], { customInstructions: '' })
  })

  it('serializes an answer that is not a string', async () => {
    const store = makeStore()
    run.mockResolvedValue({ finalOutput: { failed: 2 } })

    await runSchedule(SCHEDULE, store)

    const [, turn] = store.saveTurn.mock.calls[0]
    expect(turn.uiMessages[1].parts[0].content).toBe('{"failed":2}')
  })

  it('reports the original failure even when the cleanup fails', async () => {
    const store = makeStore()
    store.deleteWeb.mockRejectedValue(new Error('db down'))
    run.mockRejectedValue(new Error('model unavailable'))

    await expect(runSchedule(SCHEDULE, store)).rejects.toThrow('model unavailable')
  })

  it('deletes the conversation and throws when the answer is empty', async () => {
    const store = makeStore()
    run.mockResolvedValue({ finalOutput: '   ' })

    await expect(runSchedule(SCHEDULE, store)).rejects.toThrow('empty answer')

    expect(store.saveTurn).not.toHaveBeenCalled()
    expect(store.deleteWeb).toHaveBeenCalledWith(CONVERSATION_ID, 7)
  })

  it('deletes the conversation and rethrows when the agent fails', async () => {
    const store = makeStore()
    run.mockRejectedValue(new Error('model unavailable'))

    await expect(runSchedule(SCHEDULE, store)).rejects.toThrow('model unavailable')

    expect(store.deleteWeb).toHaveBeenCalledWith(CONVERSATION_ID, 7)
  })
})
