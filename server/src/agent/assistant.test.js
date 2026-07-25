import { describe, it, expect, vi } from 'vitest'

vi.mock('@openai/agents', () => ({
  Agent: class Agent {
    constructor(opts) {
      Object.assign(this, opts)
    }
  },
}))

vi.mock('./tools.js', () => {
  const allTools = [{ name: 'mock_tool' }]
  return {
    allTools,
    buildAgentTools: vi.fn(() => allTools),
  }
})

const mockResolveModel = vi.fn(async () => 'gpt-4o')
vi.mock('../openai/client.js', () => ({
  resolveModelForAgent: (...a) => mockResolveModel(...a),
  codexModelSettings: model =>
    /codex/i.test(model) ? { reasoning: { effort: 'medium' }, text: { verbosity: 'medium' } } : null,
}))

const buildRepoCatalogPrompt = vi.fn(async () => '')
vi.mock('./repo-catalog.js', () => ({ buildRepoCatalogPrompt }))

vi.mock('../shortcut/settings.js', () => ({ isShortcutConfigured: vi.fn(async () => false) }))
vi.mock('../sentry/settings.js', () => ({ isSentryConfigured: vi.fn(async () => false) }))
vi.mock('../google-drive/settings.js', () => ({ isDriveConfigured: vi.fn(async () => false) }))
vi.mock('../notion/settings.js', () => ({ isNotionConfigured: vi.fn(async () => false) }))
vi.mock('../helpjuice/settings.js', () => ({ isHelpjuiceConfigured: vi.fn(async () => false) }))
vi.mock('../postgres/settings.js', () => ({ isPostgresConfigured: vi.fn(async () => false) }))
vi.mock('../shopify/client.js', () => ({ isConfigured: vi.fn(async () => false) }))

const { createAgent } = await import('./assistant.js')

describe('createAgent', () => {
  it('creates an agent with correct name and model', async () => {
    const agent = await createAgent([], 'support')
    expect(agent.name).toBe('Soporti')
    expect(agent.model).toBe('gpt-4o')
  })

  it('sets no modelSettings for non-codex models', async () => {
    const agent = await createAgent([], 'support')
    expect(agent.modelSettings).toBeUndefined()
  })

  it('forces reasoning and verbosity to medium for codex models', async () => {
    mockResolveModel.mockResolvedValueOnce('gpt-5.2-codex')
    const agent = await createAgent([], 'support')
    expect(agent.modelSettings).toEqual({ reasoning: { effort: 'medium' }, text: { verbosity: 'medium' } })
  })

  it('includes profile instructions in system prompt', async () => {
    const techAgent = await createAgent([], 'tech')
    expect(techAgent.instructions).toContain('Technical')

    const supportAgent = await createAgent([], 'support')
    expect(supportAgent.instructions).toContain('Support')
  })

  it('includes repo instructions in system prompt', async () => {
    const agent = await createAgent(['org/repo'], 'support')
    expect(agent.instructions).toContain('org/repo')
  })

  it('includes integration instructions', async () => {
    const agent = await createAgent(['integration:notion'], 'support')
    expect(agent.instructions).toContain('Notion')
  })

  it('includes base prompt', async () => {
    const agent = await createAgent([], 'support')
    expect(agent.instructions).toContain('code assistant')
  })

  it('injects the repo catalog in YOLO mode only', async () => {
    buildRepoCatalogPrompt.mockResolvedValueOnce('## Repository catalog\n\norg/api: the backend')
    const yoloAgent = await createAgent(['yolo'], 'support')
    expect(yoloAgent.instructions).toContain('org/api: the backend')

    buildRepoCatalogPrompt.mockClear()
    const scopedAgent = await createAgent(['org/repo'], 'support')
    expect(buildRepoCatalogPrompt).not.toHaveBeenCalled()
    expect(scopedAgent.instructions).not.toContain('Repository catalog')
  })

  it('handles non-array selectedSources safely', async () => {
    const agent = await createAgent(null, 'support')
    expect(agent.tools).toEqual([{ name: 'mock_tool' }])
  })

  it('includes custom instructions when provided', async () => {
    const agent = await createAgent([], 'support', [], { customInstructions: 'Always be concise.' })
    expect(agent.instructions).toContain('User preferences')
    expect(agent.instructions).toContain('Always be concise.')
  })

  it('omits the skills block when no skill is attached', async () => {
    const agent = await createAgent([], 'support')
    expect(agent.instructions).not.toContain('Active skill')
  })

  it('includes an attached skill, combined with custom instructions', async () => {
    const agent = await createAgent([], 'support', [], {
      customInstructions: 'Always be concise.',
      skills: [{ name: 'bug-triage', instructions: 'Always ask for repro steps.' }],
    })
    expect(agent.instructions).toContain('Active skill')
    expect(agent.instructions).toContain('bug-triage')
    expect(agent.instructions).toContain('Always ask for repro steps.')
    expect(agent.instructions).toContain('Always be concise.')

    const userPrefIdx = agent.instructions.indexOf('User preferences')
    const skillIdx = agent.instructions.indexOf('Active skill(s) for this conversation')
    const finalIdx = agent.instructions.indexOf('Final reminder')
    expect(userPrefIdx).toBeLessThan(skillIdx)
    expect(skillIdx).toBeLessThan(finalIdx)
  })

  it('substitutes $ARGUMENTS in skill instructions with the message', async () => {
    const agent = await createAgent([], 'support', [], {
      skills: [{ name: 'review', instructions: 'Review $ARGUMENTS carefully. Again: $ARGUMENTS.' }],
      skillArguments: 'the Alert component',
    })
    expect(agent.instructions).toContain('Review the Alert component carefully. Again: the Alert component.')
  })

  it('does not interpret dollar sequences in the message during substitution', async () => {
    const agent = await createAgent([], 'support', [], {
      skills: [{ name: 'review', instructions: 'Review $ARGUMENTS' }],
      skillArguments: "costs $& and $' today",
    })
    expect(agent.instructions).toContain("Review costs $& and $' today")
  })

  it('substitutes positional $1-$9 placeholders with whitespace-split words', async () => {
    const agent = await createAgent([], 'support', [], {
      skills: [{ name: 'fix', instructions: 'Fix issue $1 with priority $2, full text: $ARGUMENTS' }],
      skillArguments: '123 high',
    })
    expect(agent.instructions).toContain('Fix issue 123 with priority high, full text: 123 high')
  })

  it('replaces missing positional placeholders with an empty string', async () => {
    const agent = await createAgent([], 'support', [], {
      skills: [{ name: 'fix', instructions: 'First: $1, second: $2.' }],
      skillArguments: 'only',
    })
    expect(agent.instructions).toContain('First: only, second: .')
  })

  it('does not re-substitute placeholders inside the inserted message', async () => {
    const agent = await createAgent([], 'support', [], {
      skills: [{ name: 'say', instructions: 'Say $ARGUMENTS' }],
      skillArguments: 'it costs $1 today',
    })
    expect(agent.instructions).toContain('Say it costs $1 today')
  })

  it('gives an invoked skill precedence over the default behavior rules', async () => {
    const agent = await createAgent([], 'support', [], {
      skills: [{ name: 'grilling', instructions: 'Ask one question at a time and wait.' }],
    })
    expect(agent.instructions).toContain('take precedence over the default behavior')
    expect(agent.instructions).toMatch(/precedence[\s\S]*safety rules/)
  })

  it('warns about the active skill up front, before the behavior rules can be applied', async () => {
    const agent = await createAgent([], 'support', [], {
      skills: [{ name: 'grilling', instructions: 'Ask one question at a time and wait.' }],
    })

    const noticeIdx = agent.instructions.indexOf('A skill is active')
    const skillsIdx = agent.instructions.indexOf('Active skill(s) for this conversation')
    expect(noticeIdx).toBeGreaterThan(-1)
    expect(noticeIdx).toBeLessThan(skillsIdx)
  })

  it('names the active command and frames the message as its argument', async () => {
    const agent = await createAgent([], 'support', [], {
      skills: [{ name: 'code-review', instructions: 'Review the diff.' }],
      skillArguments: 'the last commit of returns-frontend',
    })
    expect(agent.instructions).toContain('The active command(s) are "/code-review"')
    expect(agent.instructions).toContain('not a standalone question to answer directly')
    expect(agent.instructions).toContain('the skill stays in force')
  })

  it('omits the up-front skill notice when no skill is active', async () => {
    const agent = await createAgent([], 'support')
    expect(agent.instructions).not.toContain('A skill is active')
  })

  it('ignores malformed skill entries', async () => {
    const agent = await createAgent([], 'support', [], {
      skills: [{ name: 'no-instructions' }, { instructions: 'no name' }, null, { name: 'blank', instructions: '   ' }],
    })
    expect(agent.instructions).not.toContain('Active skill')
  })
})
