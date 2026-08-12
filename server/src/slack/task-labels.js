const MAX_DETAILS_LENGTH = 80

const TOOL_LABELS = {
  list_repos: { label: 'Listing repositories' },
  get_directory_contents: { label: 'Browsing directory', arg: 'path' },
  get_file_contents: { label: 'Reading file', arg: 'path' },
  search_code: { label: 'Searching code', arg: 'query' },
  find_files: { label: 'Finding files', arg: 'pattern' },
  git_log_file: { label: 'Reading file history', arg: 'path' },
  git_blame: { label: 'Blaming file', arg: 'path' },
  get_shortcut_story: { label: 'Reading Shortcut story', arg: 'id' },
  search_shortcut_stories: { label: 'Searching Shortcut', arg: 'query' },
  search_notion_pages: { label: 'Searching Notion', arg: 'query' },
  get_notion_page: { label: 'Reading Notion page', arg: 'pageId' },
  search_drive_files: { label: 'Searching Google Drive', arg: 'query' },
  get_drive_file: { label: 'Reading Drive file', arg: 'fileId' },
  list_drive_files: { label: 'Listing Drive files' },
  list_database_schemas: { label: 'Listing database schemas' },
  list_database_tables: { label: 'Listing database tables', arg: 'schema' },
  describe_database_table: { label: 'Describing table', arg: 'table' },
  query_database: { label: 'Querying the database' },
  list_log_sources: { label: 'Listing log sources' },
  describe_log_source: { label: 'Describing log source', arg: 'source' },
  search_logs: { label: 'Searching logs', arg: 'query' },
  query_logs: { label: 'Querying logs' },
  get_sentry_issue: { label: 'Reading Sentry issue', arg: 'issueId' },
  search_sentry_issues: { label: 'Searching Sentry', arg: 'query' },
  search_helpjuice_articles: { label: 'Searching Helpjuice', arg: 'query' },
  get_helpjuice_article: { label: 'Reading Helpjuice article', arg: 'articleId' },
  get_shopify_order: { label: 'Reading Shopify order', arg: 'orderId' },
  search_shopify_orders: { label: 'Searching Shopify orders', arg: 'query' },
  get_shopify_product: { label: 'Reading Shopify product', arg: 'productId' },
  get_shopify_webhooks: { label: 'Listing Shopify webhooks' },
  shopify_graphql_query: { label: 'Querying Shopify' },
}

function parseArguments(rawArguments) {
  if (!rawArguments) return {}

  try {
    const parsed = JSON.parse(rawArguments)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

function truncate(value) {
  if (value.length <= MAX_DETAILS_LENGTH) return value

  return `${value.slice(0, MAX_DETAILS_LENGTH - 1)}…`
}

export function describeToolCall(name, rawArguments) {
  const entry = TOOL_LABELS[name]

  if (!entry) return { title: name }
  if (!entry.arg) return { title: entry.label }

  const value = parseArguments(rawArguments)[entry.arg]
  if (value === undefined || value === null || value === '') return { title: entry.label }

  return { title: entry.label, details: truncate(String(value)) }
}
