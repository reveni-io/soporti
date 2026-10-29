const MAX_DETAILS_LENGTH = 80

const TOOL_LABELS = {
  get_current_time: { label: 'Checking the time' },
  resolve_time_range: { label: 'Resolving time range' },
  convert_time: { label: 'Converting time', arg: 'time' },
  list_repos: { label: 'Listing repositories' },
  get_directory_contents: { label: 'Browsing directory', arg: 'path' },
  get_file_contents: { label: 'Reading file', arg: 'path' },
  search_code: { label: 'Searching code', arg: 'query' },
  find_files: { label: 'Finding files', arg: 'pattern' },
  git_log_file: { label: 'Reading file history', arg: 'path' },
  git_blame: { label: 'Blaming file', arg: 'path' },
  get_shortcut_story: { label: 'Reading Shortcut story', arg: 'id' },
  search_shortcut_stories: { label: 'Searching Shortcut', arg: 'query' },
  create_shortcut_story: { label: 'Creating Shortcut story', arg: 'name' },
  update_shortcut_story: { label: 'Updating Shortcut story', arg: 'storyId' },
  add_shortcut_comment: { label: 'Commenting on Shortcut story', arg: 'storyId' },
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
  get_figma_file: { label: 'Reading Figma file', arg: 'file' },
  get_figma_node: { label: 'Reading Figma layers', arg: 'nodeId' },
  get_figma_screenshot: { label: 'Rendering Figma design', arg: 'nodeId' },
  list_figma_comments: { label: 'Reading Figma comments', arg: 'file' },
  post_figma_comment: { label: 'Commenting on Figma design', arg: 'nodeId' },
  zendesk_get_ticket: { label: 'Reading Zendesk ticket', arg: 'ticket' },
  zendesk_search_tickets: { label: 'Searching Zendesk tickets', arg: 'query' },
  zendesk_list_views: { label: 'Listing Zendesk views' },
  zendesk_list_view_tickets: { label: 'Listing Zendesk tickets', arg: 'viewId' },
  zendesk_post_internal_note: { label: 'Posting Zendesk internal note', arg: 'ticket' },
  sendcloud_list_accounts: { label: 'Listing Sendcloud accounts' },
  sendcloud_search_parcels: { label: 'Searching Sendcloud parcels', arg: 'orderNumber' },
  sendcloud_get_parcel: { label: 'Reading Sendcloud parcel', arg: 'parcelId' },
  sendcloud_get_tracking: { label: 'Tracking Sendcloud parcel', arg: 'trackingNumber' },
  sendcloud_list_returns: { label: 'Listing Sendcloud returns' },
  sendcloud_get_return: { label: 'Reading Sendcloud return', arg: 'returnId' },
  sendcloud_list_shipping_methods: { label: 'Listing Sendcloud shipping methods' },
  sendcloud_list_shipping_products: { label: 'Listing Sendcloud shipping products', arg: 'carrier' },
  sendcloud_get_pickup: { label: 'Reading Sendcloud pickup', arg: 'pickupId' },
  sendcloud_search_service_points: { label: 'Searching Sendcloud service points', arg: 'city' },
  sendcloud_get_service_point: { label: 'Reading Sendcloud service point', arg: 'servicePointId' },
  sendcloud_validate_address: { label: 'Validating address in Sendcloud', arg: 'city' },
  sendcloud_get_integration: { label: 'Checking Sendcloud integration', arg: 'integrationId' },
  post_slack_message: { label: 'Posting to Slack', arg: 'channel' },
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
