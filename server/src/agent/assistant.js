import { Agent } from '@openai/agents'
import { resolveModelForAgent, codexModelSettings } from '../openai/client.js'
import { buildAgentTools } from './tools.js'
import {
  buildBasePrompt,
  buildSourceInstructions,
  buildProfileInstructions,
  buildSimilarCasesPrompt,
} from './system-prompt.js'
import { isYoloMode, buildSourcePolicy } from './sources.js'
import { buildRepoCatalogPrompt } from './repo-catalog.js'
import { isShortcutConfigured } from '../shortcut/settings.js'
import { isSentryConfigured } from '../sentry/settings.js'
import { isDriveConfigured } from '../google-drive/settings.js'
import { isNotionConfigured } from '../notion/settings.js'
import { isHelpjuiceConfigured } from '../helpjuice/settings.js'
import { isPostgresConfigured } from '../postgres/settings.js'
import * as shopify from '../shopify/client.js'

// Async: the repo catalog is read from the database (admin panel → GitHub).
export async function createAgent(selectedSources, profile, similarCases, { customInstructions = '' } = {}) {
  const policy = buildSourcePolicy(selectedSources)
  const sourceInstructions = buildSourceInstructions(selectedSources)
  const profileInstructions = buildProfileInstructions(profile)
  const casesPrompt = buildSimilarCasesPrompt(similarCases)
  const catalogPrompt = isYoloMode(selectedSources) ? await buildRepoCatalogPrompt() : ''
  const userInstructions = typeof customInstructions === 'string' ? customInstructions.trim() : ''

  const parts = [buildBasePrompt(policy)]
  parts.push(profileInstructions, `## Current context\n\n${sourceInstructions}`)
  if (catalogPrompt) parts.push(catalogPrompt)
  if (casesPrompt) parts.push(casesPrompt)
  if (userInstructions) {
    parts.push(
      `## User preferences\n\nThe user has provided the following personal instructions. Follow them whenever they don't conflict with the safety and behavior rules above:\n\n${userInstructions}`
    )
  }
  parts.push(
    `## Final reminder\n\nRespond in the language of the user's most recent message. If they switched languages, switch with them — do not keep replying in the previous language.`
  )

  // The policy decides which tools the agent gets: everything in YOLO mode,
  // only the selected sources otherwise. The Shortcut, Sentry, Google Drive,
  // Notion, Helpjuice, Postgres and Shopify availability lives in the database
  // (Shopify reads its tokens from the Postgres database), so resolve them per
  // turn.
  const [
    shortcutConfigured,
    sentryConfigured,
    driveConfigured,
    notionConfigured,
    helpjuiceConfigured,
    postgresConfigured,
    shopifyConfigured,
  ] = await Promise.all([
    isShortcutConfigured(),
    isSentryConfigured(),
    isDriveConfigured(),
    isNotionConfigured(),
    isHelpjuiceConfigured(),
    isPostgresConfigured(),
    shopify.isConfigured(),
  ])
  const tools = buildAgentTools(policy, {
    shortcutConfigured,
    sentryConfigured,
    driveConfigured,
    notionConfigured,
    helpjuiceConfigured,
    postgresConfigured,
    shopifyConfigured,
  })

  const model = await resolveModelForAgent()
  const codexSettings = codexModelSettings(model)

  return new Agent({
    name: 'Soporti',
    model,
    instructions: parts.join('\n\n'),
    tools,
    ...(codexSettings ? { modelSettings: codexSettings } : {}),
  })
}
