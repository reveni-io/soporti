import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MAX_ACTIVE_SUBAGENTS, SUBAGENT_MAX_TURNS } from '../constants.js'

vi.mock('@openai/agents', () => ({
  Agent: class Agent {
    constructor(options) {
      Object.assign(this, options)
    }

    asTool(options) {
      return { name: options.toolName, description: options.toolDescription, agent: this, options }
    }
  },
}))

const listEnabledSubagents = vi.fn()
vi.mock('../db/subagents.js', () => ({ listEnabledSubagents }))

const resolveModelForAgent = vi.fn()
const isConfigured = vi.fn()
const isProviderConfigured = vi.fn()
vi.mock('../llm/model.js', () => ({ resolveModelForAgent, isConfigured, isProviderConfigured }))

vi.mock('./tools.js', () => ({
  REPO_TOOL_NAMES: new Set(['list_repos', 'get_file_contents', 'search_code']),
  selectToolsByName: (tools, names) => tools.filter(candidate => (names ?? []).includes(candidate.name)),
}))

const { buildSubagentTools, claimedToolNames, parentConfiguredFlags, resolveActiveSubagents } =
  await import('./subagents.js')

const PARENT_TOOLS = [
  { name: 'list_repos' },
  { name: 'get_file_contents' },
  { name: 'search_code' },
  { name: 'get_sentry_issue' },
  { name: 'search_sentry_issues' },
  { name: 'search_notion_pages' },
  { name: 'get_notion_page' },
]

function row(overrides = {}) {
  return {
    id: 1,
    name: 'code_investigator',
    description: 'Owns the codebase.',
    instructions: 'Read the code.',
    provider: null,
    model: null,
    tools: ['search_code'],
    exclusive: true,
    enabled: true,
    ...overrides,
  }
}

beforeEach(() => {
  listEnabledSubagents.mockReset().mockResolvedValue([])
  isConfigured.mockReset().mockResolvedValue(true)
  isProviderConfigured.mockReset().mockResolvedValue(true)
  resolveModelForAgent.mockReset().mockResolvedValue({ model: 'gpt-4o', modelSettings: { reasoning: {} } })
})

describe('resolveActiveSubagents', () => {
  it('returns the enabled rows whose provider has credentials', async () => {
    listEnabledSubagents.mockResolvedValue([row({ id: 1 }), row({ id: 2, name: 'context_gatherer' })])

    const active = await resolveActiveSubagents()

    expect(active.map(subagent => subagent.id)).toEqual([1, 2])
  })

  it('drops a row whose own provider is missing its credentials', async () => {
    listEnabledSubagents.mockResolvedValue([
      row({ id: 1, provider: 'anthropic', model: 'claude-sonnet-5' }),
      row({ id: 2, name: 'context_gatherer' }),
    ])
    isProviderConfigured.mockResolvedValue(false)

    const active = await resolveActiveSubagents()

    expect(active.map(subagent => subagent.id)).toEqual([2])
    expect(isProviderConfigured).toHaveBeenCalledWith('anthropic', { model: 'claude-sonnet-5' })
  })

  it('gates an inheriting row on the globally selected provider', async () => {
    listEnabledSubagents.mockResolvedValue([row()])
    isConfigured.mockResolvedValue(false)

    expect(await resolveActiveSubagents()).toEqual([])
    expect(isProviderConfigured).not.toHaveBeenCalled()
  })

  it('caps how many subagents can be active at once', async () => {
    listEnabledSubagents.mockResolvedValue(
      Array.from({ length: MAX_ACTIVE_SUBAGENTS + 3 }, (_, index) => row({ id: index + 1 }))
    )

    expect(await resolveActiveSubagents()).toHaveLength(MAX_ACTIVE_SUBAGENTS)
  })
})

describe('claimedToolNames', () => {
  it('unions the tools of the exclusive rows', () => {
    const claimed = claimedToolNames([
      row({ tools: ['search_code', 'get_file_contents'] }),
      row({ id: 2, name: 'context_gatherer', tools: ['search_notion_pages'] }),
    ])

    expect(claimed).toEqual(['search_code', 'get_file_contents', 'search_notion_pages'])
  })

  it('leaves the tools of a shared row with the parent', () => {
    expect(claimedToolNames([row({ exclusive: false, tools: ['search_code'] })])).toEqual([])
  })

  it('dedupes a tool two rows claim', () => {
    const claimed = claimedToolNames([row({ tools: ['search_code'] }), row({ id: 2, tools: ['search_code'] })])

    expect(claimed).toEqual(['search_code'])
  })

  it('claims nothing when there are no subagents', () => {
    expect(claimedToolNames([])).toEqual([])
  })
})

describe('parentConfiguredFlags', () => {
  const CONFIGURED = { sentryConfigured: true, notionConfigured: true, shortcutConfigured: true }

  it('turns off the flag of an integration whose tools are all gone', () => {
    const surviving = PARENT_TOOLS.filter(tool => !tool.name.includes('notion'))

    expect(parentConfiguredFlags(CONFIGURED, surviving).notionConfigured).toBe(false)
  })

  it('leaves the flag on while one of its tools survives', () => {
    const surviving = PARENT_TOOLS.filter(tool => tool.name !== 'get_notion_page')

    expect(parentConfiguredFlags(CONFIGURED, surviving).notionConfigured).toBe(true)
  })

  it('turns off an always-available integration too, so a partition does not leak', () => {
    const surviving = PARENT_TOOLS.filter(tool => !tool.name.includes('sentry'))

    expect(parentConfiguredFlags(CONFIGURED, surviving).sentryConfigured).toBe(false)
  })

  it('does not mutate the flags it was given', () => {
    const flags = { ...CONFIGURED }

    parentConfiguredFlags(flags, [])

    expect(flags).toEqual(CONFIGURED)
  })
})

describe('buildSubagentTools', () => {
  it('builds one tool per row, named after it and described by its own description', async () => {
    const tools = await buildSubagentTools(
      [row(), row({ id: 2, name: 'context_gatherer', description: 'Owns Notion.' })],
      PARENT_TOOLS
    )

    expect(tools.map(tool => tool.name)).toEqual(['ask_code_investigator', 'ask_context_gatherer'])
    expect(tools.map(tool => tool.description)).toEqual(['Owns the codebase.', 'Owns Notion.'])
  })

  it('returns nothing when there are no subagents', async () => {
    expect(await buildSubagentTools([], PARENT_TOOLS)).toEqual([])
  })

  it('intersects the allowlist with the tools the conversation actually permits', async () => {
    const [tool] = await buildSubagentTools([row({ tools: ['search_code', 'query_database'] })], PARENT_TOOLS)

    expect(tool.agent.tools).toEqual([{ name: 'search_code' }])
  })

  it('still registers a prompt-only subagent that holds no tools', async () => {
    const [tool] = await buildSubagentTools([row({ tools: [] })], PARENT_TOOLS)

    expect(tool.name).toBe('ask_code_investigator')
    expect(tool.agent.tools).toEqual([])
  })

  it('runs an inheriting row on the global provider and model', async () => {
    await buildSubagentTools([row()], PARENT_TOOLS)

    expect(resolveModelForAgent).toHaveBeenCalledWith({ provider: null, model: null })
  })

  it('runs a row that declares a provider on that provider and model', async () => {
    await buildSubagentTools([row({ provider: 'anthropic', model: 'claude-sonnet-5' })], PARENT_TOOLS)

    expect(resolveModelForAgent).toHaveBeenCalledWith({ provider: 'anthropic', model: 'claude-sonnet-5' })
  })

  it('gives the nested agent the model and settings the llm layer resolved', async () => {
    resolveModelForAgent.mockResolvedValue({ model: 'wrapped-sonnet', modelSettings: { retry: { maxRetries: 2 } } })

    const [tool] = await buildSubagentTools([row()], PARENT_TOOLS)

    expect(tool.agent.model).toBe('wrapped-sonnet')
    expect(tool.agent.modelSettings).toEqual({ retry: { maxRetries: 2 } })
    expect(tool.agent.name).toBe('code_investigator')
  })

  it('caps the nested run so a specialist cannot loop forever', async () => {
    const [tool] = await buildSubagentTools([row()], PARENT_TOOLS)

    expect(tool.options.runOptions).toEqual({ maxTurns: SUBAGENT_MAX_TURNS })
  })

  it('builds the prompt from the row instructions plus how it is being used', async () => {
    const [tool] = await buildSubagentTools([row({ instructions: '  Trace the stacktrace.  ' })], PARENT_TOOLS)

    expect(tool.agent.instructions).toMatch(/^Trace the stacktrace\.\n\n## How you are being used\n/)
    expect(tool.agent.instructions).toContain('You are a specialist invoked by another agent, not by a person.')
    expect(tool.agent.instructions).toContain('no preamble or closing question')
  })

  it('tells the subagent its language is not the user language', async () => {
    const [tool] = await buildSubagentTools([row({})], PARENT_TOOLS)

    expect(tool.agent.instructions).toContain('answer in the language the request came in')
    expect(tool.agent.instructions).toContain('never assume it is the language the user speaks')
  })

  it('appends the repo catalog to a subagent that ended up with a repo tool', async () => {
    const [tool] = await buildSubagentTools([row({ tools: ['search_code'] })], PARENT_TOOLS, {
      repoCatalogPrompt: '## Repository catalog\n\norg/api: the backend',
    })

    expect(tool.agent.instructions).toContain('org/api: the backend')
  })

  it('does not append the repo catalog to a subagent that holds no repo tool', async () => {
    const [tool] = await buildSubagentTools([row({ tools: ['get_notion_page'] })], PARENT_TOOLS, {
      repoCatalogPrompt: '## Repository catalog\n\norg/api: the backend',
    })

    expect(tool.agent.instructions).not.toContain('Repository catalog')
  })

  it('reports a nested tool call so the sources footer stays complete', async () => {
    const onNestedToolCall = vi.fn()
    const [tool] = await buildSubagentTools([row()], PARENT_TOOLS, { onNestedToolCall })

    tool.options.onStream({
      event: {
        type: 'run_item_stream_event',
        item: { type: 'tool_call_item', rawItem: { name: 'search_code', arguments: '{"repo":"org/api"}' } },
      },
    })

    expect(onNestedToolCall).toHaveBeenCalledTimes(1)
    expect(onNestedToolCall).toHaveBeenCalledWith({
      name: 'search_code',
      arguments: '{"repo":"org/api"}',
      callId: undefined,
      parent: 'ask_code_investigator',
    })
  })

  it('ignores the nested answer text, which must not interleave with the reply being streamed', async () => {
    const onNestedToolCall = vi.fn()
    const [tool] = await buildSubagentTools([row()], PARENT_TOOLS, { onNestedToolCall })

    tool.options.onStream({
      event: { type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'x' } },
    })
    tool.options.onStream({
      event: { type: 'run_item_stream_event', item: { type: 'message_output_item', rawItem: { name: 'nope' } } },
    })

    expect(onNestedToolCall).not.toHaveBeenCalled()
  })

  it('survives a stream event with no listener attached', async () => {
    const [tool] = await buildSubagentTools([row()], PARENT_TOOLS)

    expect(() =>
      tool.options.onStream({
        event: { type: 'run_item_stream_event', item: { type: 'tool_call_item', rawItem: { name: 'search_code' } } },
      })
    ).not.toThrow()
  })

  it('returns the nested answer and reports what it cost', async () => {
    const onNestedUsage = vi.fn()
    const [tool] = await buildSubagentTools([row()], PARENT_TOOLS, { onNestedUsage })

    const output = await tool.options.customOutputExtractor({
      finalOutput: 'src/agent/assistant.js:42',
      state: { usage: { requests: 1, inputTokens: 900, outputTokens: 120 } },
    })

    expect(output).toBe('src/agent/assistant.js:42')
    expect(onNestedUsage).toHaveBeenCalledWith({
      requests: 1,
      inputTokens: 900,
      outputTokens: 120,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
    })
  })

  it('serializes a nested answer that is not a string', async () => {
    const [tool] = await buildSubagentTools([row()], PARENT_TOOLS)

    expect(await tool.options.customOutputExtractor({ finalOutput: { file: 'a.js' }, state: {} })).toBe(
      '{"file":"a.js"}'
    )
  })

  it('tags a nested call with the tool the caller invoked', async () => {
    const onNestedToolCall = vi.fn()
    const [tool] = await buildSubagentTools([row()], PARENT_TOOLS, { onNestedToolCall })

    tool.options.onStream({
      event: {
        type: 'run_item_stream_event',
        item: { type: 'tool_call_item', rawItem: { name: 'search_code', arguments: '{}', callId: 'nested-1' } },
      },
      toolCall: { name: 'ask_code_investigator', callId: 'wrapper-1' },
    })

    expect(onNestedToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ callId: 'nested-1', parent: 'ask_code_investigator' })
    )
  })

  it('reports the end of a nested call so its step can close', async () => {
    const onNestedToolResult = vi.fn()
    const [tool] = await buildSubagentTools([row()], PARENT_TOOLS, { onNestedToolResult })

    tool.options.onStream({
      event: {
        type: 'run_item_stream_event',
        item: { type: 'tool_call_output_item', rawItem: { name: 'search_code', callId: 'nested-1' } },
      },
      toolCall: { name: 'ask_code_investigator' },
    })

    expect(onNestedToolResult).toHaveBeenCalledWith({
      name: 'search_code',
      callId: 'nested-1',
      parent: 'ask_code_investigator',
    })
  })

  it('ignores the text a subagent streams so it never reaches the answer', async () => {
    const onNestedToolCall = vi.fn()
    const onNestedToolResult = vi.fn()
    const [tool] = await buildSubagentTools([row()], PARENT_TOOLS, { onNestedToolCall, onNestedToolResult })

    tool.options.onStream({ event: { type: 'raw_model_stream_event', data: { type: 'output_text_delta' } } })

    expect(onNestedToolCall).not.toHaveBeenCalled()
    expect(onNestedToolResult).not.toHaveBeenCalled()
  })
})
