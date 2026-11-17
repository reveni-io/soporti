import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@openai/agents', () => ({
  Agent: class Agent {
    constructor(options) {
      Object.assign(this, options)
    }
  },
  run: vi.fn(),
}))
vi.mock('../llm/model.js', () => ({ resolveModelForAgent: vi.fn() }))

const { run } = await import('@openai/agents')
const { resolveModelForAgent } = await import('../llm/model.js')
const { generateGreeting } = await import('./greeting.js')

const BOT = { id: 4, name: 'Ticket triager', description: 'Triage the new Zendesk tickets.' }
const FALLBACK = "Hi! I'm Ticket triager. Tell me what you need and I'll get on it."

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  resolveModelForAgent.mockResolvedValue({ model: 'gpt-test', modelSettings: { reasoning: { effort: 'low' } } })
  run.mockResolvedValue({ finalOutput: '  Hi, I am Ticket triager. Shall we look at today’s tickets?  ' })
})

describe('generateGreeting', () => {
  it('asks a tool-less agent for a single-turn greeting written from the description', async () => {
    const greeting = await generateGreeting(BOT)

    expect(greeting).toBe('Hi, I am Ticket triager. Shall we look at today’s tickets?')
    expect(run).toHaveBeenCalledTimes(1)
    const [agent, input, options] = run.mock.calls[0]
    expect(agent).toMatchObject({
      name: 'Ticket triager',
      model: 'gpt-test',
      modelSettings: { reasoning: { effort: 'low' } },
    })
    expect(agent.tools).toBeUndefined()
    expect(agent.instructions).toContain('> Triage the new Zendesk tickets.')
    expect(input).toBe('(You were just created. Introduce yourself.)')
    expect(options).toEqual({ maxTurns: 1 })
  })

  it('falls back to a plain greeting when the agent fails', async () => {
    run.mockRejectedValue(new Error('model unavailable'))

    expect(await generateGreeting(BOT)).toBe(FALLBACK)
    expect(console.error).toHaveBeenCalledWith('[bots] Failed to write the greeting of bot 4:', expect.any(Error))
  })

  it('falls back to a plain greeting when the agent answers with nothing', async () => {
    run.mockResolvedValue({ finalOutput: '   ' })

    expect(await generateGreeting(BOT)).toBe(FALLBACK)
    expect(console.error).toHaveBeenCalledWith('[bots] The greeting of bot 4 came back empty.')
  })

  it('falls back when the model cannot be resolved', async () => {
    resolveModelForAgent.mockRejectedValue(new Error('not configured'))

    expect(await generateGreeting(BOT)).toBe(FALLBACK)
    expect(run).not.toHaveBeenCalled()
  })

  it('falls back when the answer is not text', async () => {
    run.mockResolvedValue({ finalOutput: { greeting: 'hi' } })

    expect(await generateGreeting(BOT)).toBe(FALLBACK)
  })
})
