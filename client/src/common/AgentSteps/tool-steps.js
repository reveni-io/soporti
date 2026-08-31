const TOOL_LABELS = {
  list_repos: 'Listing repositories',
  get_directory_contents: 'Browsing directory',
  get_file_contents: 'Reading file',
  search_code: 'Searching code',
  find_files: 'Finding files',
  git_blame: 'Reading blame',
  git_log_file: 'Reading file history',
  get_shortcut_story: 'Reading Shortcut story',
  search_shortcut_stories: 'Searching Shortcut stories',
  list_shortcut_iterations: 'Listing iterations',
  get_shortcut_iteration_stories: 'Reading iteration stories',
  list_shortcut_epics: 'Listing epics',
  list_shortcut_members: 'Listing Shortcut members',
  search_notion_pages: 'Searching Notion',
  get_notion_page: 'Reading Notion page',
  search_drive_files: 'Searching Drive',
  get_drive_file: 'Reading Drive file',
  list_drive_files: 'Listing Drive files',
  search_granola_notes: 'Searching meeting notes',
  get_granola_note: 'Reading meeting note',
  list_database_schemas: 'Listing schemas',
  list_database_tables: 'Listing tables',
  describe_database_table: 'Describing table',
  query_database: 'Querying database',
  list_log_sources: 'Listing log sources',
  describe_log_source: 'Describing log source',
  search_logs: 'Searching logs',
  query_logs: 'Querying logs',
  get_sentry_issue: 'Reading Sentry issue',
  search_sentry_issues: 'Searching Sentry',
  search_helpjuice_articles: 'Searching help center',
  get_helpjuice_article: 'Reading help article',
  get_shopify_order: 'Reading Shopify order',
  search_shopify_orders: 'Searching Shopify orders',
  get_shopify_product: 'Reading Shopify product',
  get_shopify_webhooks: 'Reading Shopify webhooks',
  shopify_graphql_query: 'Querying Shopify',
  render_artifact: 'Writing artifact',
}

const FALLBACK_LABEL = 'Working'
const SECOND_MS = 1000

export function describeToolCall({ tool, input, done, durationMs, parent }) {
  return {
    label: TOOL_LABELS[tool] || humanizeToolName(tool),
    detail: formatDetail(input),
    duration: formatDuration(durationMs),
    done: Boolean(done),
    nested: Boolean(parent),
  }
}

function humanizeToolName(tool) {
  const words = String(tool || '')
    .replace(/_/g, ' ')
    .trim()

  if (!words) return FALLBACK_LABEL

  return words.charAt(0).toUpperCase() + words.slice(1)
}

function formatDetail(input) {
  if (!input) return ''

  const { repo, path, query } = input

  if (query) return repo ? `"${query}" in ${repo}` : `"${query}"`
  if (repo) return path ? `${repo}/${path}` : `${repo}/`

  return path || ''
}

function formatDuration(durationMs) {
  if (!durationMs) return ''
  if (durationMs < SECOND_MS) return `${durationMs}ms`

  return `${(durationMs / SECOND_MS).toFixed(1)}s`
}
