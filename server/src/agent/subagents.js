import { Agent } from '@openai/agents'
import { listEnabledSubagents } from '../db/subagents.js'
import { isConfigured, isProviderConfigured, resolveModelForAgent } from '../llm/model.js'
import { extractUsage } from '../llm/usage.js'
import { REPO_TOOL_NAMES, selectToolsByName } from './tools.js'
import { INTEGRATION_TOOL_NAMES } from './sources.js'
import { INTEGRATIONS } from './integrations.js'
import { MAX_ACTIVE_SUBAGENTS, SUBAGENT_MAX_TURNS, SUBAGENT_TOOL_PREFIX } from '../constants.js'

const ROLE_SECTION = `## How you are being used

You are a specialist invoked by another agent, not by a person. Answer only what was asked, in plain text, with the specifics the caller needs — findings, values, file paths, ids — and no preamble or closing question. You cannot ask a follow-up: if the request is ambiguous, state the assumption you made and answer under it. Everything you return goes back to the calling agent, never directly to a user.`

export async function resolveActiveSubagents() {
  const rows = await listEnabledSubagents()
  const available = await Promise.all(
    rows.map(row => (row.provider ? isProviderConfigured(row.provider) : isConfigured()))
  )

  return rows.filter((_, index) => available[index]).slice(0, MAX_ACTIVE_SUBAGENTS)
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

async function buildSubagentTool(row, parentTools, { onNestedToolCall, onNestedUsage, repoCatalogPrompt }) {
  const tools = selectToolsByName(parentTools, row.tools)
  const { model, modelSettings } = await resolveModelForAgent({ provider: row.provider, model: row.model })

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
    onStream: ({ event }) => {
      if (event.type !== 'run_item_stream_event') return
      if (event.item?.type !== 'tool_call_item') return

      onNestedToolCall?.({ name: event.item.rawItem?.name, arguments: event.item.rawItem?.arguments })
    },
    customOutputExtractor: async result => {
      onNestedUsage?.(extractUsage(result.state?.usage))

      return typeof result.finalOutput === 'string' ? result.finalOutput : JSON.stringify(result.finalOutput)
    },
  })
}

export async function buildSubagentTools(subagents, parentTools, hooks = {}) {
  const { onNestedToolCall = null, onNestedUsage = null, repoCatalogPrompt = '' } = hooks

  return Promise.all(
    subagents.map(row => buildSubagentTool(row, parentTools, { onNestedToolCall, onNestedUsage, repoCatalogPrompt }))
  )
}
