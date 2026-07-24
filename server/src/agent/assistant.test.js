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
})
