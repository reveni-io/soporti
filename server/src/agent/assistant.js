import { Agent } from '@openai/agents'
import { resolveModelForAgent } from '../llm/model.js'
import { buildAgentTools } from './tools.js'
import {
  buildBasePrompt,
  buildSourceInstructions,
  buildProfileInstructions,
  buildSkillsPrompt,
} from './system-prompt.js'
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
  { customInstructions = '', skills: invokedSkills = [], skillArguments = '', userId = null } = {}
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

  const sourceInstructions = buildSourceInstructions(selectedSources, configured)
  const profileInstructions = buildProfileInstructions(profile)
  const userInstructions = typeof customInstructions === 'string' ? customInstructions.trim() : ''
  const skillsPrompt = buildSkillsPrompt(invokedSkills, skillArguments)

  const parts = [buildBasePrompt(policy, { hasActiveSkills: Boolean(skillsPrompt), configured })]
  parts.push(profileInstructions, `## Current context\n\n${sourceInstructions}`)
  if (catalogPrompt) parts.push(catalogPrompt)
  if (userInstructions) {
    parts.push(
      `## User preferences\n\nThe user has provided the following personal instructions. Follow them whenever they don't conflict with the safety and behavior rules above:\n\n${userInstructions}`
    )
  }
  if (skillsPrompt) parts.push(skillsPrompt)
  parts.push(
    `## Final reminder\n\nRespond in the language of the user's most recent message. If they switched languages, switch with them — do not keep replying in the previous language.`
  )

  const tools = buildAgentTools(policy, configured, { userId })

  const { model, modelSettings } = await resolveModelForAgent()

  return new Agent({
    name: 'Soporti',
    model,
    instructions: parts.join('\n\n'),
    tools,
    modelSettings,
  })
}
