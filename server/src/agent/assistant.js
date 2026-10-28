import { Agent } from '@openai/agents'
import { resolveModelForAgent } from '../llm/model.js'
import { buildAgentTools, excludeToolsByName, REPO_TOOL_NAMES, restrictToolsByName } from './tools.js'
import { applyToolDescriptions } from './tool-overrides.js'
import {
  buildBasePrompt,
  buildCurrentDatePrompt,
  buildSourceInstructions,
  buildProfileInstructions,
  buildSkillsPrompt,
  buildSubagentsPrompt,
} from './system-prompt.js'
import { buildSubagentTools, claimedToolNames, parentConfiguredFlags, resolveActiveSubagents } from './subagents.js'
import { getMainAgentTools } from './settings.js'
import { canonicalizeTimezone, describeInstant } from './clock.js'
import { DEFAULT_TIMEZONE } from '../constants.js'
import { assertReadOnlyTools, isYoloMode, buildSourcePolicy } from './sources.js'
import { buildRepoCatalogPrompt } from './repo-catalog.js'
import { areShortcutWritesEnabled, isShortcutConfigured } from '../shortcut/settings.js'
import { isSentryConfigured } from '../sentry/settings.js'
import { isDriveConfigured } from '../google-drive/settings.js'
import { isNotionConfigured } from '../notion/settings.js'
import { isHelpjuiceConfigured } from '../helpjuice/settings.js'
import { isPostgresConfigured } from '../postgres/settings.js'
import { isBetterstackConfigured } from '../betterstack/settings.js'
import { isGranolaConfigured } from '../granola/settings.js'
import { getFigmaCommentsEnabled, isFigmaConfigured } from '../figma/settings.js'
import { getZendeskConnection } from '../zendesk/settings.js'
import { isSlackConfigured } from '../slack/settings.js'
import * as shopify from '../shopify/client.js'

function resolveRunScope(readOnly, { userId, conversationId, onArtifactPublished }) {
  if (readOnly) return { userId: null, conversationId: null, onArtifactPublished: null }

  return { userId, conversationId, onArtifactPublished }
}

function resolveWriteFlags(readOnly, { shortcutWrites, figmaComments, zendeskConnection, slackConfigured }) {
  if (readOnly) return { shortcutWrites: false, figmaComments: false, zendeskWrites: false, slackConfigured: false }

  return {
    shortcutWrites,
    figmaComments,
    zendeskWrites: Boolean(zendeskConnection?.writesEnabled),
    slackConfigured,
  }
}

export async function createAgent(
  selectedSources,
  profile,
  {
    customInstructions = '',
    skills: invokedSkills = [],
    skillArguments = '',
    userId: requestedUserId = null,
    conversationId: requestedConversationId = null,
    onArtifactPublished: requestedOnArtifactPublished = null,
    onNestedToolCall = null,
    onNestedToolResult = null,
    onNestedUsage = null,
    unattended = false,
    timezone = null,
    readOnly = false,
    promptOverrides = null,
  } = {}
) {
  const { userId, conversationId, onArtifactPublished } = resolveRunScope(readOnly, {
    userId: requestedUserId,
    conversationId: requestedConversationId,
    onArtifactPublished: requestedOnArtifactPublished,
  })
  const userTimezone = canonicalizeTimezone(timezone)
  const zone = userTimezone ?? DEFAULT_TIMEZONE
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
    figmaConfigured,
    zendeskConnection,
    shortcutWrites,
    figmaCommentsEnabled,
    slackConfigured,
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
    isFigmaConfigured(),
    getZendeskConnection(userId),
    areShortcutWritesEnabled(),
    getFigmaCommentsEnabled(),
    isSlackConfigured(),
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
    figmaConfigured,
    zendeskConfigured: Boolean(zendeskConnection),
  }

  const writeFlags = resolveWriteFlags(readOnly, {
    shortcutWrites,
    figmaComments: figmaConfigured && figmaCommentsEnabled,
    zendeskConnection,
    slackConfigured,
  })
  const built = buildAgentTools(policy, configured, {
    userId,
    conversationId,
    onArtifactPublished,
    timezone: zone,
    ...writeFlags,
  })
  const registered = applyToolDescriptions(readOnly ? assertReadOnlyTools(built) : built, promptOverrides?.tools)
  const allowed = mainAgentTools ? restrictToolsByName(registered, mainAgentTools) : registered
  const subagentTools = await buildSubagentTools(subagents, registered, {
    onNestedToolCall,
    onNestedToolResult,
    onNestedUsage,
    repoCatalogPrompt: catalogPrompt,
  })
  const parentTools = excludeToolsByName(allowed, claimedToolNames(subagents))

  const parentToolNames = new Set(parentTools.map(candidate => candidate.name))
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
      rendersMarkdownImages: Boolean(conversationId),
      hasRepoTools,
      toolNames: parentToolNames,
      unattended,
      sectionOverrides: promptOverrides?.sections,
    }),
  ]
  const datePrompt = buildCurrentDatePrompt(describeInstant(new Date(), zone), {
    isUserTimezone: Boolean(userTimezone),
  })
  parts.push(profileInstructions, `## Current context\n\n${datePrompt}\n\n${sourceInstructions}`)
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
