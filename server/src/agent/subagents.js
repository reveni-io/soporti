import { Agent } from '@openai/agents'
import { listEnabledSubagents } from '../db/subagents.js'
import { isConfigured, isProviderConfigured, resolveModelForAgent } from '../llm/model.js'
import { extractUsage } from '../llm/usage.js'
import { REPO_TOOL_NAMES, selectToolsByName } from './tools.js'
import { toolCallFromRawItem } from './run-items.js'
import { INTEGRATION_TOOL_NAMES } from './sources.js'
import { INTEGRATIONS } from './integrations.js'
import { MAX_ACTIVE_SUBAGENTS, SUBAGENT_MAX_TURNS, SUBAGENT_TOOL_PREFIX } from '../constants.js'

const ROLE_SECTION = `## How you are being used

You are a specialist invoked by another agent, not by a person. Answer only what was asked, in plain text, with the specifics the caller needs — findings, values, file paths, ids — and no preamble or closing question. You cannot ask a follow-up: if the request is ambiguous, state the assumption you made and answer under it. Everything you return goes back to the calling agent, never directly to a user, and the caller rewrites it before anyone reads it — so answer in the language the request came in and never assume it is the language the user speaks.`

function selectionKey(row) {
  return `${row.provider ?? ''}|${row.model ?? ''}`
}

export async function resolveActiveSubagents() {
  const rows = await listEnabledSubagents()
  const selections = [...new Map(rows.map(row => [selectionKey(row), row]))]
  const checks = await Promise.all(
    selections.map(([, row]) =>
      row.provider ? isProviderConfigured(row.provider, { model: row.model }) : isConfigured()
    )
  )
  const available = new Map(selections.map(([key], index) => [key, checks[index]]))

  return rows.filter(row => available.get(selectionKey(row))).slice(0, MAX_ACTIVE_SUBAGENTS)
}

export function claimedToolNames(subagents) {
  const claimed = new Set()

  for (const row of subagents) {
    if (!row.exclusive) continue

    for (const name of row.tools) claimed.add(name)
  }

  return [...claimed]
}

export function parentConfiguredFlags(configured, parentTools) {
  const surviving = new Set(parentTools.map(candidate => candidate.name))
  const flags = { ...configured }

  for (const [id, names] of Object.entries(INTEGRATION_TOOL_NAMES)) {
    if (names.some(name => surviving.has(name))) continue

    flags[INTEGRATIONS[id].flag] = false
  }

  return flags
}

function buildSubagentPrompt(row, tools, repoCatalogPrompt) {
  const parts = [row.instructions.trim()]

  if (repoCatalogPrompt && tools.some(candidate => REPO_TOOL_NAMES.has(candidate.name))) {
    parts.push(repoCatalogPrompt)
  }
  parts.push(ROLE_SECTION)

  return parts.join('\n\n')
}

async function buildSubagentTool(row, parentTools, hooks, resolveModel) {
  const { onNestedToolCall, onNestedToolResult, onNestedUsage, repoCatalogPrompt = '' } = hooks
  const tools = selectToolsByName(parentTools, row.tools)
  const { model, modelSettings } = await resolveModel(row)

  const agent = new Agent({
    name: row.name,
    model,
    modelSettings,
    instructions: buildSubagentPrompt(row, tools, repoCatalogPrompt),
    tools,
  })

  return agent.asTool({
    toolName: `${SUBAGENT_TOOL_PREFIX}${row.name}`,
    toolDescription: row.description,
    runOptions: { maxTurns: SUBAGENT_MAX_TURNS },
    onStream: ({ event, toolCall }) => {
      if (event.type !== 'run_item_stream_event') return

      const item = event.item
      const parent = toolCall?.name || `${SUBAGENT_TOOL_PREFIX}${row.name}`

      if (item?.type === 'tool_call_item') {
        onNestedToolCall?.(toolCallFromRawItem(item.rawItem, parent))
        return
      }

      if (item?.type === 'tool_call_output_item') {
        onNestedToolResult?.(toolCallFromRawItem(item.rawItem, parent))
      }
    },
    customOutputExtractor: async result => {
      onNestedUsage?.(extractUsage(result.state?.usage))

      const output = result.finalOutput

      return typeof output === 'string' ? output : (JSON.stringify(output) ?? '')
    },
  })
}

export async function buildSubagentTools(subagents, parentTools, hooks = {}) {
  const models = new Map()
  const resolveModel = row => {
    const key = selectionKey(row)
    if (!models.has(key)) models.set(key, resolveModelForAgent({ provider: row.provider, model: row.model }))

    return models.get(key)
  }

  return Promise.all(subagents.map(row => buildSubagentTool(row, parentTools, hooks, resolveModel)))
}
