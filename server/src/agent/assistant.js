import { Agent } from '@openai/agents'
import { resolveModelForAgent } from '../llm/model.js'
import { buildAgentTools, excludeToolsByName, REPO_TOOL_NAMES, restrictToolsByName } from './tools.js'
import {
  buildBasePrompt,
  buildSourceInstructions,
  buildProfileInstructions,
  buildSkillsPrompt,
  buildSubagentsPrompt,
} from './system-prompt.js'
import { buildSubagentTools, claimedToolNames, parentConfiguredFlags, resolveActiveSubagents } from './subagents.js'
import { getMainAgentTools } from './settings.js'
import { isYoloMode, buildSourcePolicy } from './sources.js'
import { buildRepoCatalogPrompt } from './repo-catalog.js'
import { isShortcutConfigured } from '../shortcut/settings.js'
import { isSentryConfigured } from '../sentry/settings.js'
import { isDriveConfigured } from '../google-drive/settings.js'
import { isNotionConfigured } from '../notion/settings.js'
import { isHelpjuiceConfigured } from '../helpjuice/settings.js'
import { isPostgresConfigured } from '../postgres/settings.js'
import { isBetterstackConfigured } from '../betterstack/settings.js'
import { isGranolaConfigured } from '../granola/settings.js'
import * as shopify from '../shopify/client.js'

export async function createAgent(
  selectedSources,
  profile,
  {
    customInstructions = '',
    skills: invokedSkills = [],
    skillArguments = '',
    userId = null,
    conversationId = null,
    onArtifactPublished = null,
    onNestedToolCall = null,
    onNestedToolResult = null,
    onNestedUsage = null,
  } = {}
) {
  const policy = buildSourcePolicy(selectedSources)

  const [
    shortcutConfigured,
    sentryConfigured,
    driveConfigured,
    notionConfigured,
    helpjuiceConfigured,
    postgresConfigured,
    shopifyConfigured,
    betterstackConfigured,
    granolaConfigured,
    catalogPrompt,
    subagents,
    mainAgentTools,
  ] = await Promise.all([
    isShortcutConfigured(),
    isSentryConfigured(),
    isDriveConfigured(),
    isNotionConfigured(),
    isHelpjuiceConfigured(),
    isPostgresConfigured(),
    shopify.isConfigured(),
    isBetterstackConfigured(),
    isGranolaConfigured(userId),
    isYoloMode(selectedSources) ? buildRepoCatalogPrompt() : '',
    resolveActiveSubagents(),
    getMainAgentTools(),
  ])
  const configured = {
    shortcutConfigured,
    sentryConfigured,
    driveConfigured,
    notionConfigured,
    helpjuiceConfigured,
    postgresConfigured,
    shopifyConfigured,
    betterstackConfigured,
    granolaConfigured,
  }

  const registered = buildAgentTools(policy, configured, { userId, conversationId, onArtifactPublished })
  const allowed = mainAgentTools ? restrictToolsByName(registered, mainAgentTools) : registered
  const subagentTools = await buildSubagentTools(subagents, registered, {
    onNestedToolCall,
    onNestedToolResult,
    onNestedUsage,
    repoCatalogPrompt: catalogPrompt,
  })
  const parentTools = excludeToolsByName(allowed, claimedToolNames(subagents))

  const hasRepoTools = parentTools.some(candidate => REPO_TOOL_NAMES.has(candidate.name))
  const parentConfigured = parentConfiguredFlags(configured, parentTools)

  const sourceInstructions = buildSourceInstructions(selectedSources, parentConfigured, { hasRepoTools })
  const profileInstructions = buildProfileInstructions(profile)
  const userInstructions = typeof customInstructions === 'string' ? customInstructions.trim() : ''
  const skillsPrompt = buildSkillsPrompt(invokedSkills, skillArguments)
  const subagentsPrompt = buildSubagentsPrompt(subagents)

  const parts = [
    buildBasePrompt(policy, {
      hasActiveSkills: Boolean(skillsPrompt),
      configured: parentConfigured,
      canRenderArtifacts: Boolean(conversationId),
      hasRepoTools,
    }),
  ]
  parts.push(profileInstructions, `## Current context\n\n${sourceInstructions}`)
  if (catalogPrompt && hasRepoTools) parts.push(catalogPrompt)
  if (userInstructions) {
    parts.push(
      `## User preferences\n\nThe user has provided the following personal instructions. Follow them whenever they don't conflict with the safety and behavior rules above:\n\n${userInstructions}`
    )
  }
  if (subagentsPrompt) parts.push(subagentsPrompt)
  if (skillsPrompt) parts.push(skillsPrompt)

  const { model, modelSettings } = await resolveModelForAgent()

  return new Agent({
    name: 'Soporti',
    model,
    instructions: parts.join('\n\n'),
    tools: [...parentTools, ...subagentTools],
    modelSettings,
  })
}
