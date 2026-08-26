import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@openai/agents', () => ({
  Agent: class Agent {
    constructor(opts) {
      Object.assign(this, opts)
    }

    asTool(options) {
      return { name: options.toolName, description: options.toolDescription, agent: this, options }
    }
  },
}))

const REPO_TOOLS = ['list_repos', 'get_file_contents', 'search_code']
const AVAILABLE_TOOL_NAMES = [
  ...REPO_TOOLS,
  'get_shortcut_story',
  'search_notion_pages',
  'search_drive_files',
  'query_database',
  'get_sentry_issue',
  'search_logs',
  'search_helpjuice_articles',
  'get_shopify_order',
  'search_granola_notes',
  'render_artifact',
]

function toolList(names = AVAILABLE_TOOL_NAMES) {
  return names.map(name => ({ name }))
}

vi.mock('./tools.js', () => ({
  allTools: REPO_TOOLS.map(name => ({ name })),
  REPO_TOOL_NAMES: new Set(REPO_TOOLS),
  buildAgentTools: vi.fn(() => toolList()),
  selectToolsByName: (tools, names) => tools.filter(candidate => (names ?? []).includes(candidate.name)),
  excludeToolsByName: (tools, names) => tools.filter(candidate => !(names ?? []).includes(candidate.name)),
}))

const mockResolveModel = vi.fn(async () => ({
  provider: 'openai',
  modelId: 'gpt-4o',
  model: 'gpt-4o',
  modelSettings: {},
}))
const mockIsConfigured = vi.fn(async () => true)
const mockIsProviderConfigured = vi.fn(async () => true)
vi.mock('../llm/model.js', () => ({
  resolveModelForAgent: (...a) => mockResolveModel(...a),
  isConfigured: (...a) => mockIsConfigured(...a),
  isProviderConfigured: (...a) => mockIsProviderConfigured(...a),
}))

const listEnabledSubagents = vi.fn(async () => [])
vi.mock('../db/subagents.js', () => ({ listEnabledSubagents }))

const buildRepoCatalogPrompt = vi.fn(async () => '')
vi.mock('./repo-catalog.js', () => ({ buildRepoCatalogPrompt }))

vi.mock('../shortcut/settings.js', () => ({ isShortcutConfigured: vi.fn(async () => false) }))
vi.mock('../sentry/settings.js', () => ({ isSentryConfigured: vi.fn(async () => false) }))
vi.mock('../google-drive/settings.js', () => ({ isDriveConfigured: vi.fn(async () => false) }))
vi.mock('../notion/settings.js', () => ({ isNotionConfigured: vi.fn(async () => false) }))
vi.mock('../helpjuice/settings.js', () => ({ isHelpjuiceConfigured: vi.fn(async () => false) }))
vi.mock('../postgres/settings.js', () => ({ isPostgresConfigured: vi.fn(async () => false) }))
vi.mock('../betterstack/settings.js', () => ({ isBetterstackConfigured: vi.fn(async () => false) }))
vi.mock('../shopify/client.js', () => ({ isConfigured: vi.fn(async () => false) }))
vi.mock('../granola/settings.js', () => ({ isGranolaConfigured: vi.fn(async () => false) }))

const { isShortcutConfigured } = await import('../shortcut/settings.js')
const { isSentryConfigured } = await import('../sentry/settings.js')
const { isDriveConfigured } = await import('../google-drive/settings.js')
const { isNotionConfigured } = await import('../notion/settings.js')
const { isHelpjuiceConfigured } = await import('../helpjuice/settings.js')
const { isPostgresConfigured } = await import('../postgres/settings.js')
const { isBetterstackConfigured } = await import('../betterstack/settings.js')
const { isConfigured: isShopifyConfigured } = await import('../shopify/client.js')
const { isGranolaConfigured } = await import('../granola/settings.js')
const { buildAgentTools } = await import('./tools.js')
const { createAgent } = await import('./assistant.js')

const CONFIGURATION_CHECKS = [
  isShortcutConfigured,
  isSentryConfigured,
  isDriveConfigured,
  isNotionConfigured,
  isHelpjuiceConfigured,
  isPostgresConfigured,
  isBetterstackConfigured,
  isShopifyConfigured,
  isGranolaConfigured,
]

describe('createAgent', () => {
  beforeEach(() => {
    for (const isConfigured of CONFIGURATION_CHECKS) isConfigured.mockResolvedValue(false)
    buildRepoCatalogPrompt.mockResolvedValue('')
    buildAgentTools.mockClear()
    buildAgentTools.mockReturnValue(toolList())
    listEnabledSubagents.mockReset().mockResolvedValue([])
    mockIsConfigured.mockReset().mockResolvedValue(true)
    mockIsProviderConfigured.mockReset().mockResolvedValue(true)
    mockResolveModel.mockReset().mockResolvedValue({
      provider: 'openai',
      modelId: 'gpt-4o',
      model: 'gpt-4o',
      modelSettings: {},
    })
  })

  it('creates an agent with correct name and model', async () => {
    const agent = await createAgent([], 'support')
    expect(agent.name).toBe('Soporti')
    expect(agent.model).toBe('gpt-4o')
  })

  it('passes the settings resolved by the llm layer straight to the agent', async () => {
    mockResolveModel.mockResolvedValueOnce({
      provider: 'openai',
      modelId: 'gpt-5.2-codex',
      model: 'gpt-5.2-codex',
      modelSettings: { reasoning: { effort: 'medium' }, text: { verbosity: 'medium' } },
    })

    const agent = await createAgent([], 'support')

    expect(agent.model).toBe('gpt-5.2-codex')
    expect(agent.modelSettings).toEqual({ reasoning: { effort: 'medium' }, text: { verbosity: 'medium' } })
  })

  it('works with a provider whose model is an object rather than an id', async () => {
    const aiSdkModel = { specificationVersion: 'v3' }
    mockResolveModel.mockResolvedValueOnce({
      provider: 'anthropic',
      modelId: 'claude-opus-5',
      model: aiSdkModel,
      modelSettings: { providerData: { providerOptions: { anthropic: { thinking: { type: 'adaptive' } } } } },
    })

    const agent = await createAgent([], 'support')

    expect(agent.model).toBe(aiSdkModel)
    expect(agent.modelSettings.providerData.providerOptions.anthropic.thinking).toEqual({ type: 'adaptive' })
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

  it('includes integration instructions for a configured integration', async () => {
    isNotionConfigured.mockResolvedValue(true)

    const agent = await createAgent(['integration:notion'], 'support')

    expect(agent.instructions).toContain('## Notion integration')
    expect(agent.instructions).toContain('search_notion_pages')
    expect(agent.instructions).toContain('Repository tools are not available')
  })

  it('omits the section and instructions of a selected integration that is not configured', async () => {
    const agent = await createAgent(['integration:notion'], 'support')

    expect(agent.instructions).not.toContain('## Notion integration')
    expect(agent.instructions).not.toContain('search_notion_pages')
    expect(agent.instructions).toContain('No source is available in this conversation')
    expect(agent.instructions).toContain('Notion is selected but not configured in this app')
  })

  it('omits the Shortcut and Sentry sections when neither is configured', async () => {
    const agent = await createAgent(['org/repo'], 'support')

    expect(agent.instructions).not.toContain('## Shortcut integration')
    expect(agent.instructions).not.toContain('## Sentry integration')
    expect(agent.instructions).not.toContain('not part of the source selection')
  })

  it('names only the configured always-available integration in a restricted selection', async () => {
    isSentryConfigured.mockResolvedValue(true)

    const agent = await createAgent(['org/repo'], 'support')

    expect(agent.instructions).toContain('## Sentry integration')
    expect(agent.instructions).toContain('Sentry is not part of the source selection')
    expect(agent.instructions).not.toContain('## Shortcut integration')
  })

  it('lists only the configured integrations in YOLO mode', async () => {
    isPostgresConfigured.mockResolvedValue(true)

    const agent = await createAgent(['yolo'], 'support')

    expect(agent.instructions).toContain('## PostgreSQL integration')
    expect(agent.instructions).toContain('The integration tools available in this conversation are Database')
    expect(agent.instructions).not.toContain('## Shopify integration')
    expect(agent.instructions).not.toContain('## Google Drive integration')
  })

  it('tells the agent to rely on repositories in YOLO mode when no integration is configured', async () => {
    const agent = await createAgent(['yolo'], 'support')

    expect(agent.instructions).toContain('No integrations are available in this conversation')
    expect(agent.instructions).not.toContain('## Notion integration')
  })

  it('includes base prompt', async () => {
    const agent = await createAgent([], 'support')
    expect(agent.instructions).toContain('code assistant')
  })

  it('injects the repo catalog in YOLO mode only', async () => {
    buildRepoCatalogPrompt.mockResolvedValue('## Repository catalog\n\norg/api: the backend')
    const yoloAgent = await createAgent(['yolo'], 'support')
    expect(yoloAgent.instructions).toContain('org/api: the backend')

    buildRepoCatalogPrompt.mockClear()
    const scopedAgent = await createAgent(['org/repo'], 'support')
    expect(buildRepoCatalogPrompt).not.toHaveBeenCalled()
    expect(scopedAgent.instructions).not.toContain('Repository catalog')
  })

  it('handles non-array selectedSources safely', async () => {
    const agent = await createAgent(null, 'support')
    expect(agent.tools).toEqual(toolList())
  })

  it('includes custom instructions when provided', async () => {
    const agent = await createAgent([], 'support', { customInstructions: 'Always be concise.' })
    expect(agent.instructions).toContain('User preferences')
    expect(agent.instructions).toContain('Always be concise.')
  })

  it('omits the skills block when no skill is attached', async () => {
    const agent = await createAgent([], 'support')
    expect(agent.instructions).not.toContain('Active skill')
  })

  it('includes an attached skill, combined with custom instructions', async () => {
    const agent = await createAgent([], 'support', {
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
    const agent = await createAgent([], 'support', {
      skills: [{ name: 'review', instructions: 'Review $ARGUMENTS carefully. Again: $ARGUMENTS.' }],
      skillArguments: 'the Alert component',
    })
    expect(agent.instructions).toContain('Review the Alert component carefully. Again: the Alert component.')
  })

  it('does not interpret dollar sequences in the message during substitution', async () => {
    const agent = await createAgent([], 'support', {
      skills: [{ name: 'review', instructions: 'Review $ARGUMENTS' }],
      skillArguments: "costs $& and $' today",
    })
    expect(agent.instructions).toContain("Review costs $& and $' today")
  })

  it('substitutes positional $1-$9 placeholders with whitespace-split words', async () => {
    const agent = await createAgent([], 'support', {
      skills: [{ name: 'fix', instructions: 'Fix issue $1 with priority $2, full text: $ARGUMENTS' }],
      skillArguments: '123 high',
    })
    expect(agent.instructions).toContain('Fix issue 123 with priority high, full text: 123 high')
  })

  it('replaces missing positional placeholders with an empty string', async () => {
    const agent = await createAgent([], 'support', {
      skills: [{ name: 'fix', instructions: 'First: $1, second: $2.' }],
      skillArguments: 'only',
    })
    expect(agent.instructions).toContain('First: only, second: .')
  })

  it('does not re-substitute placeholders inside the inserted message', async () => {
    const agent = await createAgent([], 'support', {
      skills: [{ name: 'say', instructions: 'Say $ARGUMENTS' }],
      skillArguments: 'it costs $1 today',
    })
    expect(agent.instructions).toContain('Say it costs $1 today')
  })

  it('gives an invoked skill precedence over the default behavior rules', async () => {
    const agent = await createAgent([], 'support', {
      skills: [{ name: 'grilling', instructions: 'Ask one question at a time and wait.' }],
    })
    expect(agent.instructions).toContain('take precedence over the default behavior')
    expect(agent.instructions).toMatch(/precedence[\s\S]*safety rules/)
  })

  it('warns about the active skill up front, before the behavior rules can be applied', async () => {
    const agent = await createAgent([], 'support', {
      skills: [{ name: 'grilling', instructions: 'Ask one question at a time and wait.' }],
    })

    const noticeIdx = agent.instructions.indexOf('A skill is active')
    const skillsIdx = agent.instructions.indexOf('Active skill(s) for this conversation')
    expect(noticeIdx).toBeGreaterThan(-1)
    expect(noticeIdx).toBeLessThan(skillsIdx)
  })

  it('names the active command and frames the message as its argument', async () => {
    const agent = await createAgent([], 'support', {
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
    const agent = await createAgent([], 'support', {
      skills: [{ name: 'no-instructions' }, { instructions: 'no name' }, null, { name: 'blank', instructions: '   ' }],
    })
    expect(agent.instructions).not.toContain('Active skill')
  })

  it('forwards the resolved integration availability to the tool builder', async () => {
    isBetterstackConfigured.mockResolvedValue(true)

    await createAgent(['integration:betterstack'], 'support')

    expect(buildAgentTools).toHaveBeenCalledWith(
      expect.objectContaining({ integrations: ['betterstack'], unrestricted: false }),
      expect.objectContaining({ betterstackConfigured: true, sentryConfigured: false }),
      { userId: null, conversationId: null, onArtifactPublished: null }
    )
  })

  it('resolves Granola for the requesting user and passes the id to the tool builder', async () => {
    isGranolaConfigured.mockResolvedValue(true)

    await createAgent(['integration:granola'], 'support', { userId: 7 })

    expect(isGranolaConfigured).toHaveBeenCalledWith(7)
    expect(buildAgentTools).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ granolaConfigured: true }),
      { userId: 7, conversationId: null, onArtifactPublished: null }
    )
  })

  it('leaves Granola unconfigured when there is no user, so no notes are reachable', async () => {
    isGranolaConfigured.mockResolvedValue(false)

    await createAgent(['integration:granola'], 'support')

    expect(isGranolaConfigured).toHaveBeenCalledWith(null)
    expect(buildAgentTools).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ granolaConfigured: false }),
      { userId: null, conversationId: null, onArtifactPublished: null }
    )
  })
})

describe('createAgent with subagents', () => {
  function subagentRow(overrides = {}) {
    return {
      id: 1,
      name: 'code_investigator',
      description: 'Owns the codebase.',
      instructions: 'Read the code.',
      provider: null,
      model: null,
      tools: ['search_code'],
      exclusive: false,
      enabled: true,
      ...overrides,
    }
  }

  beforeEach(() => {
    for (const isConfigured of CONFIGURATION_CHECKS) isConfigured.mockResolvedValue(false)
    buildRepoCatalogPrompt.mockResolvedValue('')
    buildAgentTools.mockClear()
    buildAgentTools.mockReturnValue(toolList())
    listEnabledSubagents.mockReset().mockResolvedValue([])
    mockIsConfigured.mockReset().mockResolvedValue(true)
    mockIsProviderConfigured.mockReset().mockResolvedValue(true)
    mockResolveModel.mockReset().mockResolvedValue({
      provider: 'openai',
      modelId: 'gpt-4o',
      model: 'gpt-4o',
      modelSettings: {},
    })
  })

  it('produces the same tools and the same instructions as today when nothing is configured', async () => {
    isSentryConfigured.mockResolvedValue(true)
    isNotionConfigured.mockResolvedValue(true)

    const withSubagentsAvailable = await createAgent(['org/api', 'integration:notion'], 'support', {
      customInstructions: 'Be brief.',
      conversationId: 'c-1',
    })

    listEnabledSubagents.mockResolvedValue([])
    const baseline = await createAgent(['org/api', 'integration:notion'], 'support', {
      customInstructions: 'Be brief.',
      conversationId: 'c-1',
    })

    expect(withSubagentsAvailable.instructions).toBe(baseline.instructions)
    expect(withSubagentsAvailable.tools).toEqual(baseline.tools)
    expect(withSubagentsAvailable.instructions).not.toContain('Specialists')
  })

  it('adds no Specialists section and no extra tool when there is no subagent', async () => {
    const agent = await createAgent(['org/api'], 'support')

    expect(agent.instructions).not.toContain('## Specialists')
    expect(agent.tools).toEqual(toolList())
  })

  it('appends one tool per subagent, after the parent tools', async () => {
    listEnabledSubagents.mockResolvedValue([
      subagentRow(),
      subagentRow({ id: 2, name: 'context_gatherer', tools: ['search_notion_pages'] }),
    ])

    const agent = await createAgent(['org/api'], 'support')

    expect(agent.tools.slice(-2).map(tool => tool.name)).toEqual(['ask_code_investigator', 'ask_context_gatherer'])
    expect(agent.instructions).toContain('## Specialists')
    expect(agent.instructions).toContain('`ask_code_investigator`')
  })

  it('selects each subagent slice from the parent array before any subagent tool exists', async () => {
    listEnabledSubagents.mockResolvedValue([subagentRow()])

    const agent = await createAgent(['org/api'], 'support')

    const [askTool] = agent.tools.filter(tool => tool.name === 'ask_code_investigator')
    expect(askTool.agent.tools).toEqual([{ name: 'search_code' }])
    expect(askTool.agent.tools.some(tool => tool.name.startsWith('ask_'))).toBe(false)
  })

  it('takes an exclusive subagent tools away from the main agent', async () => {
    listEnabledSubagents.mockResolvedValue([subagentRow({ exclusive: true })])

    const agent = await createAgent(['org/api'], 'support')

    expect(agent.tools.map(tool => tool.name)).not.toContain('search_code')
    expect(agent.tools.map(tool => tool.name)).toContain('ask_code_investigator')
  })

  it('leaves a shared subagent tools with the main agent as well', async () => {
    listEnabledSubagents.mockResolvedValue([subagentRow({ exclusive: false })])

    const agent = await createAgent(['org/api'], 'support')

    expect(agent.tools.map(tool => tool.name)).toContain('search_code')
  })

  it('ignores a disabled subagent entirely, so its tools stay with the main agent', async () => {
    listEnabledSubagents.mockResolvedValue([])

    const agent = await createAgent(['org/api'], 'support')

    expect(agent.tools.map(tool => tool.name)).toContain('search_code')
    expect(agent.instructions).not.toContain('## Specialists')
  })

  it('stops advertising an integration whose tools all moved to a specialist', async () => {
    isSentryConfigured.mockResolvedValue(true)
    listEnabledSubagents.mockResolvedValue([
      subagentRow({ exclusive: true, tools: ['get_sentry_issue', 'search_sentry_issues'] }),
    ])

    const agent = await createAgent(['org/api'], 'support')

    expect(agent.instructions).not.toContain('get_sentry_issue')
  })

  it('stops advertising code exploration when the repo tools moved to a specialist', async () => {
    listEnabledSubagents.mockResolvedValue([
      subagentRow({ exclusive: true, tools: ['list_repos', 'get_file_contents', 'search_code'] }),
    ])

    const agent = await createAgent(['org/api'], 'support')

    expect(agent.instructions).not.toContain('How to explore code')
    expect(agent.instructions).toContain('they belong to a specialist agent')
  })

  it('moves the repo catalog to the specialist that owns the repo tools in YOLO mode', async () => {
    buildRepoCatalogPrompt.mockResolvedValue('## Repository catalog\n\norg/api: the backend')
    listEnabledSubagents.mockResolvedValue([
      subagentRow({ exclusive: true, tools: ['list_repos', 'get_file_contents', 'search_code'] }),
    ])

    const agent = await createAgent(['yolo'], 'support')

    expect(agent.instructions).not.toContain('org/api: the backend')
    const [askTool] = agent.tools.filter(tool => tool.name === 'ask_code_investigator')
    expect(askTool.agent.instructions).toContain('org/api: the backend')
  })

  it('keeps the repo catalog with the main agent when it still holds repo tools', async () => {
    buildRepoCatalogPrompt.mockResolvedValue('## Repository catalog\n\norg/api: the backend')
    listEnabledSubagents.mockResolvedValue([subagentRow({ exclusive: false })])

    const agent = await createAgent(['yolo'], 'support')

    expect(agent.instructions).toContain('org/api: the backend')
  })

  it('places the Specialists section before the active skill so the skill still wins', async () => {
    listEnabledSubagents.mockResolvedValue([subagentRow()])

    const agent = await createAgent(['org/api'], 'support', {
      skills: [{ name: 'bug-triage', instructions: 'Ask for repro steps.' }],
    })

    expect(agent.instructions.indexOf('## Specialists')).toBeLessThan(
      agent.instructions.indexOf('## Active skill(s) for this conversation')
    )
  })

  it('forwards the nested hooks so a delegated tool call is still recorded', async () => {
    const onNestedToolCall = vi.fn()
    const onNestedUsage = vi.fn()
    listEnabledSubagents.mockResolvedValue([subagentRow()])

    const agent = await createAgent(['org/api'], 'support', { onNestedToolCall, onNestedUsage })

    const [askTool] = agent.tools.filter(tool => tool.name === 'ask_code_investigator')
    askTool.options.onStream({
      event: {
        type: 'run_item_stream_event',
        item: { type: 'tool_call_item', rawItem: { name: 'search_code', arguments: '{}' } },
      },
    })

    expect(onNestedToolCall).toHaveBeenCalledWith({ name: 'search_code', arguments: '{}' })
    expect(onNestedUsage).not.toHaveBeenCalled()
  })
})
