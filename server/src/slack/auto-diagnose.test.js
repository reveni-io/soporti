import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@openai/agents', () => ({ run: vi.fn() }))

vi.mock('../agent/assistant.js', () => ({
  createAgent: vi.fn(() => ({ name: 'agent' })),
}))

vi.mock('../knowledge/client.js', () => ({
  searchSimilarCases: vi.fn(async () => []),
}))

vi.mock('../config.js', () => ({
  default: {
    agent: { maxIterations: 7 },
    autoDiagnose: { profile: 'tech' },
  },
}))

import { run } from '@openai/agents'
import { createAgent } from '../agent/assistant.js'
import { searchSimilarCases } from '../knowledge/client.js'
import { diagnoseTicket, buildAgentInput } from './auto-diagnose.js'

const TICKET = { title: 'Bug', fields: [{ label: 'Details', value: 'roto' }] }

describe('buildAgentInput', () => {
  it('returns the plain prompt string when there are no images', () => {
    expect(buildAgentInput('hello', [])).toBe('hello')
    expect(buildAgentInput('hello')).toBe('hello')
  })

  it('returns a multimodal user message when images are present', () => {
    const input = buildAgentInput('hello', ['data:image/png;base64,AQID'])
    expect(input).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'hello' },
          { type: 'input_image', image: 'data:image/png;base64,AQID' },
        ],
      },
    ])
  })
})

describe('diagnoseTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    run.mockResolvedValue({ finalOutput: 'Diagnóstico: ok' })
  })

  it('builds the chat agent in YOLO mode with no user instructions', async () => {
    await diagnoseTicket(TICKET)
    expect(createAgent).toHaveBeenCalledWith(['yolo'], 'tech', [], {
      customInstructions: '',
    })
  })

  it('runs with a string input when there are no screenshots', async () => {
    await diagnoseTicket(TICKET)
    const [, input, opts] = run.mock.calls[0]
    expect(typeof input).toBe('string')
    expect(input).toContain('roto')
    expect(opts).toMatchObject({ maxTurns: 7 })
  })

  it('passes screenshots as input_image content', async () => {
    await diagnoseTicket(TICKET, { images: ['data:image/png;base64,AQID'] })
    const [, input] = run.mock.calls[0]
    expect(Array.isArray(input)).toBe(true)
    expect(input[0].content).toContainEqual({ type: 'input_image', image: 'data:image/png;base64,AQID' })
  })

  it('redacts credential-shaped strings from the reply', async () => {
    run.mockResolvedValue({ finalOutput: `leak ghp_${'a'.repeat(36)} end` })
    const out = await diagnoseTicket(TICKET)
    expect(out).toContain('[redacted]')
    expect(out).not.toContain('ghp_')
  })

  it('does not fail when similar-case search throws', async () => {
    searchSimilarCases.mockRejectedValueOnce(new Error('vector store down'))
    const out = await diagnoseTicket(TICKET)
    expect(out).toBe('Diagnóstico: ok')
  })

  it('serializes a non-string finalOutput defensively', async () => {
    run.mockResolvedValue({ finalOutput: { unexpected: true } })
    const out = await diagnoseTicket(TICKET)
    expect(out).toContain('unexpected')
  })
})
