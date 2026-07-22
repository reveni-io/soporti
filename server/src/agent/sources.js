export const YOLO_SOURCE = 'yolo'

export function isYoloMode(selectedSources) {
  return Array.isArray(selectedSources) && selectedSources.includes(YOLO_SOURCE)
}

const INTEGRATION_PREFIX = 'integration:'

// Splits a source selection into the access policy the agent must respect.
// YOLO is an explicit "you decide" and stays unrestricted; an empty selection
// only reaches the API from legacy callers that always got the full toolset,
// so it stays unrestricted too. Anything else restricts the agent to the
// listed repos and integrations.
export function buildSourcePolicy(selectedSources) {
  const list = Array.isArray(selectedSources) ? selectedSources.filter(s => typeof s === 'string') : []
  const unrestricted = list.length === 0 || list.includes(YOLO_SOURCE)
  const repos = list.filter(s => s !== YOLO_SOURCE && !s.startsWith(INTEGRATION_PREFIX))
  const integrations = list.filter(s => s.startsWith(INTEGRATION_PREFIX)).map(s => s.slice(INTEGRATION_PREFIX.length))
  return { unrestricted, repos, integrations }
}

const REPO_TOOLS = new Set(['get_directory_contents', 'get_file_contents', 'search_code'])

const TOOL_TO_INTEGRATION = {
  get_shortcut_story: 'Shortcut',
  search_shortcut_stories: 'Shortcut',
  search_notion_pages: 'Notion',
  get_notion_page: 'Notion',
  list_database_schemas: 'Database',
  list_database_tables: 'Database',
  describe_database_table: 'Database',
  query_database: 'Database',
  get_sentry_issue: 'Sentry',
  search_sentry_issues: 'Sentry',
  search_helpjuice_articles: 'Helpjuice',
  get_helpjuice_article: 'Helpjuice',
  get_shopify_order: 'Shopify',
  search_shopify_orders: 'Shopify',
  get_shopify_product: 'Shopify',
  get_shopify_webhooks: 'Shopify',
  shopify_graphql_query: 'Shopify',
  search_drive_files: 'Google Drive',
  get_drive_file: 'Google Drive',
  list_drive_files: 'Google Drive',
}

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
