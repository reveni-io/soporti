import { MAX_SOURCES, MAX_SOURCE_LENGTH } from '../constants.js'
import { INTEGRATIONS } from './integrations.js'

export const YOLO_SOURCE = 'yolo'

export function isSourceList(sources) {
  if (!Array.isArray(sources) || sources.length > MAX_SOURCES) return false
  return sources.every(source => typeof source === 'string' && source.length > 0 && source.length <= MAX_SOURCE_LENGTH)
}

export function isYoloMode(selectedSources) {
  return Array.isArray(selectedSources) && selectedSources.includes(YOLO_SOURCE)
}

const INTEGRATION_PREFIX = 'integration:'

export function buildSourcePolicy(selectedSources) {
  const list = Array.isArray(selectedSources) ? selectedSources.filter(s => typeof s === 'string') : []
  const unrestricted = list.length === 0 || list.includes(YOLO_SOURCE)
  const repos = list.filter(s => s !== YOLO_SOURCE && !s.startsWith(INTEGRATION_PREFIX))
  const integrations = list.filter(s => s.startsWith(INTEGRATION_PREFIX)).map(s => s.slice(INTEGRATION_PREFIX.length))
  return { unrestricted, repos, integrations }
}

const REPO_TOOLS = new Set(['get_directory_contents', 'get_file_contents', 'search_code'])

const INTEGRATION_TOOL_NAMES = {
  shortcut: ['get_shortcut_story', 'search_shortcut_stories'],
  notion: ['search_notion_pages', 'get_notion_page'],
  'google-drive': ['search_drive_files', 'get_drive_file', 'list_drive_files'],
  postgres: ['list_database_schemas', 'list_database_tables', 'describe_database_table', 'query_database'],
  sentry: ['get_sentry_issue', 'search_sentry_issues'],
  betterstack: ['list_log_sources', 'describe_log_source', 'search_logs', 'query_logs'],
  helpjuice: ['search_helpjuice_articles', 'get_helpjuice_article'],
  granola: ['search_granola_notes', 'get_granola_note'],
  shopify: [
    'get_shopify_order',
    'search_shopify_orders',
    'get_shopify_product',
    'get_shopify_webhooks',
    'shopify_graphql_query',
  ],
}

const TOOL_TO_INTEGRATION = Object.fromEntries(
  Object.entries(INTEGRATION_TOOL_NAMES).flatMap(([id, names]) => names.map(name => [name, INTEGRATIONS[id].label]))
)

function parseArgs(rawArgs) {
  if (!rawArgs) return {}
  if (typeof rawArgs === 'object') return rawArgs
  try {
    return JSON.parse(rawArgs)
  } catch {
    return {}
  }
}

export function collectConsultedSources(toolCalls) {
  const repos = new Set()
  const integrations = new Set()

  for (const call of toolCalls || []) {
    const name = call?.name
    if (!name) continue

    if (REPO_TOOLS.has(name)) {
      const args = parseArgs(call.arguments)
      if (args.repo && typeof args.repo === 'string') repos.add(args.repo)
      continue
    }

    const integration = TOOL_TO_INTEGRATION[name]
    if (integration) integrations.add(integration)
  }

  return { repos: [...repos], integrations: [...integrations] }
}

export function buildSourcesFooter(toolCalls) {
  const { repos, integrations } = collectConsultedSources(toolCalls)
  const parts = []
  for (const repo of repos) parts.push(`\`${repo}\``)
  for (const integration of integrations) parts.push(integration)
  if (parts.length === 0) return ''
  return `\n\n---\n_Sources consulted: ${parts.join(', ')}_`
}
