import { z } from 'zod'
import { tool } from '@openai/agents'
import { listRepos } from '../github/client.js'
import {
  getDirectoryContents,
  getFileContents,
  searchCode,
  findFiles,
  gitLogFile,
  gitBlame,
} from '../repo-pool/index.js'
import * as shortcut from '../shortcut/client.js'
import * as notion from '../notion/client.js'
import * as postgres from '../postgres/client.js'
import * as sentry from '../sentry/client.js'
import * as helpjuice from '../helpjuice/client.js'
import * as shopify from '../shopify/client.js'
import * as googleDrive from '../google-drive/client.js'

export const listReposTool = tool({
  name: 'list_repos',
  description: 'List all available repositories. Use this if you are unsure which repo to look at.',
  parameters: z.object({}),
  execute: async () => {
    const repos = await listRepos()
    return JSON.stringify(repos)
  },
})

export function buildRepoTools(allowedRepos = null) {
  const guard = run => async input => {
    if (allowedRepos && !allowedRepos.includes(input.repo)) {
      return JSON.stringify({
        error: `Repository "${input.repo}" is not among the sources selected for this conversation. Allowed repositories: ${allowedRepos.join(', ')}.`,
      })
    }
    return run(input)
  }

  return [
    tool({
      name: 'get_directory_contents',
      description: 'List files and subdirectories at a given path inside a repository. Use empty path for root.',
      parameters: z.object({
        repo: z.string().describe('Full repository name "owner/repo".'),
        path: z.string().optional().default('').describe('Directory path. Empty string for root.'),
      }),
      execute: guard(async input => {
        const result = await getDirectoryContents(input.repo, input.path)
        return JSON.stringify(result)
      }),
    }),
    tool({
      name: 'get_file_contents',
      description:
        'Read the contents of a specific file in a repository. By default returns the first 2000 lines. Use offset and limit to paginate through larger files. Response includes totalLines, truncated, and nextOffset to read more.',
      parameters: z.object({
        repo: z.string().describe('Full repository name "owner/repo".'),
        path: z.string().describe('File path inside the repo.'),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe('0-based line number to start reading from. Default 0 (start of file).'),
        limit: z.number().int().min(1).max(5000).default(2000).describe('Max lines to return. Default 2000, max 5000.'),
      }),
      execute: guard(async input => {
        const result = await getFileContents(input.repo, input.path, { offset: input.offset, limit: input.limit })
        return JSON.stringify(result)
      }),
    }),
    tool({
      name: 'search_code',
      description:
        'Search for code across a repository. Returns matching {path, line, snippet} entries (not just file paths). Supports literal or regex search, case-insensitive matching, and a path glob filter (e.g. "*.js"). Default is case-sensitive literal match.',
      parameters: z.object({
        repo: z.string().describe('Full repository name "owner/repo".'),
        query: z.string().describe('Search keyword, function name, or regex pattern.'),
        pathGlob: z
          .string()
          .default('')
          .describe('Optional path glob to limit the search (e.g. "*.js", "*.test.*"). Empty for no filter.'),
        caseInsensitive: z.boolean().default(false).describe('If true, match case-insensitively.'),
        regex: z
          .boolean()
          .default(false)
          .describe('If true, treat query as a POSIX extended regex; otherwise as a literal string.'),
        maxResults: z.number().int().min(1).max(100).default(100).describe('Max number of matches to return.'),
      }),
      execute: guard(async input => {
        const result = await searchCode(input.repo, input.query, {
          pathGlob: input.pathGlob,
          caseInsensitive: input.caseInsensitive,
          regex: input.regex,
          maxResults: input.maxResults,
        })
        return JSON.stringify(result)
      }),
    }),
    tool({
      name: 'find_files',
      description:
        'Find files in a repository by name or path pattern (without reading their content). Use simple names like "auth.js" to match basenames anywhere in the tree, or include "/" (e.g. "src/components/*.jsx") to match against the full path. Globs use shell wildcards (* and ?). .git, node_modules and .env* are excluded automatically.',
      parameters: z.object({
        repo: z.string().describe('Full repository name "owner/repo".'),
        pattern: z.string().describe('Filename or path pattern (e.g. "auth.js", "*.test.js", "src/*/index.ts").'),
        maxResults: z.number().int().min(1).max(200).default(200).describe('Max number of files to return.'),
      }),
      execute: guard(async input => {
        const result = await findFiles(input.repo, input.pattern, { maxResults: input.maxResults })
        return JSON.stringify(result)
      }),
    }),
    tool({
      name: 'git_log_file',
      description:
        'Get the recent git history of a specific file. Returns the last N commits that touched the file with hash, author, email, date (ISO 8601) and subject. Useful for "who changed this and when".',
      parameters: z.object({
        repo: z.string().describe('Full repository name "owner/repo".'),
        path: z.string().describe('File path inside the repo.'),
        limit: z.number().int().min(1).max(100).default(20).describe('Max number of commits to return.'),
      }),
      execute: guard(async input => {
        const result = await gitLogFile(input.repo, input.path, { limit: input.limit })
        return JSON.stringify(result)
      }),
    }),
    tool({
      name: 'git_blame',
      description:
        'Blame a line range of a file. Returns, for each line in the range, the commit hash, author, date, summary and content. Useful for "what commit introduced this line" — pair it with a Sentry stacktrace or a search_code match.',
      parameters: z.object({
        repo: z.string().describe('Full repository name "owner/repo".'),
        path: z.string().describe('File path inside the repo.'),
        startLine: z.number().int().min(1).default(1).describe('First line to blame (1-based).'),
        endLine: z
          .number()
          .int()
          .min(1)
          .default(500)
          .describe('Last line to blame (1-based, inclusive). Capped to startLine + 499.'),
      }),
      execute: guard(async input => {
        const result = await gitBlame(input.repo, input.path, { startLine: input.startLine, endLine: input.endLine })
        return JSON.stringify(result)
      }),
    }),
  ]
}

export const [
  getDirectoryContentsTool,
  getFileContentsTool,
  searchCodeTool,
  findFilesTool,
  gitLogFileTool,
  gitBlameTool,
] = buildRepoTools()

export const getShortcutStoryTool = tool({
  name: 'get_shortcut_story',
  description:
    'Get the details of a Shortcut story (user story / bug / chore) by its numeric ID. Returns title, description, state, type, labels, tasks, and more.',
  parameters: z.object({
    id: z.number().describe('Numeric story ID (e.g. 1234). If the user says "sc-1234", use 1234.'),
  }),
  execute: async input => {
    const story = await shortcut.getStory(input.id)
    return JSON.stringify(story)
  },
})

export const searchShortcutStoriesTool = tool({
  name: 'search_shortcut_stories',
  description:
    'Search Shortcut stories by text query. Useful to find a user story when the user mentions it by name or keyword instead of ID.',
  parameters: z.object({
    query: z.string().describe('Free-text search query.'),
  }),
  execute: async input => {
    const result = await shortcut.searchStories(input.query)
    return JSON.stringify(result)
  },
})

export const searchNotionPagesTool = tool({
  name: 'search_notion_pages',
  description: 'Search Notion pages by keyword. Returns a list of matching pages with their IDs, titles, and URLs.',
  parameters: z.object({
    query: z.string().describe('Search keyword or phrase.'),
  }),
  execute: async input => {
    const results = await notion.searchPages(input.query)
    return JSON.stringify(results)
  },
})

export const getNotionPageTool = tool({
  name: 'get_notion_page',
  description: 'Read the full content of a Notion page by its ID. Returns title, URL, and the page content as text.',
  parameters: z.object({
    pageId: z.string().describe('Notion page ID (with or without dashes, e.g. "abc123def456" or "abc123-def-456").'),
  }),
  execute: async input => {
    const page = await notion.getPage(input.pageId)
    return JSON.stringify(page)
  },
})

export const searchDriveFilesTool = tool({
  name: 'search_drive_files',
  description:
    'Search Google Drive documentation by keyword (full-text and filename). Returns matching files with their IDs, names, types, and URLs. Empty results may mean the folder is not shared with the assistant rather than that the document does not exist.',
  parameters: z.object({
    query: z.string().describe('Search keyword or phrase.'),
  }),
  execute: async input => {
    const results = await googleDrive.searchFiles(input.query)
    return JSON.stringify(results)
  },
})

export const getDriveFileTool = tool({
  name: 'get_drive_file',
  description:
    'Read the text content of a Google Drive file by its ID (Google Docs/Sheets/Slides, text/markdown, PDFs, and Office .docx/.xlsx/.pptx). Returns the content plus a url to cite. If `truncated` is true the content is partial; if a `notice` is present the file could not be fully read (e.g. scanned PDF, too large, not shared).',
  parameters: z.object({
    fileId: z.string().describe('Google Drive file ID.'),
  }),
  execute: async input => {
    const file = await googleDrive.getFile(input.fileId)
    return JSON.stringify(file)
  },
})

export const listDriveFilesTool = tool({
  name: 'list_drive_files',
  description:
    'Browse Google Drive. Leave folderId empty to list the top-level entry points the assistant can access (everything shared with it, plus shared drives) — use this first to discover what exists. Pass a folderId to list the direct contents of that folder (non-recursive). Returns files and subfolders with their IDs, names, types, and URLs.',
  parameters: z.object({
    folderId: z
      .string()
      .optional()
      .default('')
      .describe(
        'Google Drive folder ID. Leave empty to list everything shared with the assistant (top-level folders/files and shared drives).'
      ),
  }),
  execute: async input => {
    const results = await googleDrive.listFiles(input.folderId)
    return JSON.stringify(results)
  },
})

export const listDatabaseSchemasTool = tool({
  name: 'list_database_schemas',
  description:
    'List all non-system schemas in the PostgreSQL database. Use this as a starting point to explore the database structure.',
  parameters: z.object({}),
  execute: async () => {
    const schemas = await postgres.listSchemas()
    return JSON.stringify(schemas)
  },
})

export const listDatabaseTablesTool = tool({
  name: 'list_database_tables',
  description: 'List all tables and views in a given database schema, with approximate row counts.',
  parameters: z.object({
    schema: z.string().optional().default('public').describe('Schema name (defaults to "public").'),
  }),
  execute: async input => {
    const tables = await postgres.listTables(input.schema)
    return JSON.stringify(tables)
  },
})

export const describeDatabaseTableTool = tool({
  name: 'describe_database_table',
  description: 'Describe the columns, types, primary keys, and foreign keys of a specific database table.',
  parameters: z.object({
    schema: z.string().optional().default('public').describe('Schema name (defaults to "public").'),
    table: z.string().describe('Table name to describe.'),
  }),
  execute: async input => {
    const info = await postgres.describeTable(input.schema, input.table)
    return JSON.stringify(info)
  },
})

export const queryDatabaseTool = tool({
  name: 'query_database',
  description:
    'Execute a read-only SQL SELECT query against the PostgreSQL database. Only SELECT and WITH (CTE) queries are allowed. Results are capped at a configured row limit (100 by default). Always use LIMIT in your queries for efficiency.',
  parameters: z.object({
    sql: z.string().describe('SQL SELECT query to execute.'),
  }),
  execute: async input => {
    const result = await postgres.runQuery(input.sql)
    return JSON.stringify(result)
  },
})

export const getSentryIssueTool = tool({
  name: 'get_sentry_issue',
  description:
    'Get the details of a Sentry issue by its ID. Accepts numeric IDs (e.g. "4651301283"), short IDs (e.g. "PROJECT-123"), or Sentry URLs (extract the numeric ID from the URL). Returns title, status, level, count, affected users, stacktrace, and more.',
  parameters: z.object({
    issueId: z
      .string()
      .describe('Sentry issue ID: numeric ID, short ID like "PROJECT-123", or extracted from a Sentry URL.'),
  }),
  execute: async input => {
    const issue = await sentry.getIssue(input.issueId)
    return JSON.stringify(issue)
  },
})

export const searchSentryIssuesTool = tool({
  name: 'search_sentry_issues',
  description:
    'Search Sentry issues by query. Useful to find issues related to an error message, exception type, or keyword. Returns a list of matching issues.',
  parameters: z.object({
    query: z.string().describe('Free-text search query (error message, exception type, keyword).'),
  }),
  execute: async input => {
    const results = await sentry.searchIssues(input.query)
    return JSON.stringify(results)
  },
})

export const searchHelpjuiceArticlesTool = tool({
  name: 'search_helpjuice_articles',
  description:
    'Search Helpjuice help center articles by keyword. Returns a list of matching articles with their IDs, titles, and URLs.',
  parameters: z.object({
    query: z.string().describe('Search keyword or phrase.'),
  }),
  execute: async input => {
    const results = await helpjuice.searchArticles(input.query)
    return JSON.stringify(results)
  },
})

export const getHelpjuiceArticleTool = tool({
  name: 'get_helpjuice_article',
  description:
    'Read the full content of a Helpjuice article by its ID. Returns title, URL, and the article body as plain text.',
  parameters: z.object({
    articleId: z.string().describe('Helpjuice article ID.'),
  }),
  execute: async input => {
    const article = await helpjuice.getArticle(input.articleId)
    return JSON.stringify(article)
  },
})

const storeParams = {
  store: z
    .string()
    .describe(
      'Store identifier: the Shopify store domain (e.g. "mystore" or "mystore.myshopify.com") or the store ID used by the connected database. NOT the store\'s commercial name — resolve a name to a domain/ID first (e.g. with the database tools).'
    ),
}

export const getShopifyOrderTool = tool({
  name: 'get_shopify_order',
  description:
    'Get a Shopify order by its numeric ID. Returns order details including status, line items, fulfillments, and refunds. Useful to compare Shopify data with backend data.',
  parameters: z.object({
    orderId: z.string().describe('Shopify order numeric ID.'),
    ...storeParams,
  }),
  execute: async input => {
    const result = await shopify.getOrder(input.orderId, input.store)
    return JSON.stringify(result)
  },
})

export const searchShopifyOrdersTool = tool({
  name: 'search_shopify_orders',
  description: 'Search Shopify orders by email, order number, or name. Returns a list of matching orders.',
  parameters: z.object({
    query: z.string().describe('Search query: email address, order number, or customer name.'),
    ...storeParams,
  }),
  execute: async input => {
    const result = await shopify.searchOrders(input.query, input.store)
    return JSON.stringify(result)
  },
})

export const getShopifyProductTool = tool({
  name: 'get_shopify_product',
  description:
    'Get a Shopify product by its numeric ID. Returns product details including variants, prices, and inventory.',
  parameters: z.object({
    productId: z.string().describe('Shopify product numeric ID.'),
    ...storeParams,
  }),
  execute: async input => {
    const result = await shopify.getProduct(input.productId, input.store)
    return JSON.stringify(result)
  },
})

export const getShopifyWebhooksTool = tool({
  name: 'get_shopify_webhooks',
  description: 'List all webhooks configured in a Shopify store. Useful for debugging synchronization issues.',
  parameters: z.object({ ...storeParams }),
  execute: async input => {
    const result = await shopify.getWebhooks(input.store)
    return JSON.stringify(result)
  },
})

export const shopifyGraphqlQueryTool = tool({
  name: 'shopify_graphql_query',
  description:
    'Execute a read-only GraphQL query against the Shopify Admin API. Only queries are allowed — mutations are blocked. Use this for complex lookups not covered by other Shopify tools.',
  parameters: z.object({
    query: z.string().describe('GraphQL query string (read-only, no mutations).'),
    variables: z.string().default('').describe('JSON string of GraphQL variables, if needed. Leave empty if none.'),
    ...storeParams,
  }),
  execute: async input => {
    const variables = input.variables ? JSON.parse(input.variables) : {}
    const result = await shopify.graphqlQuery(input.query, variables, input.store)
    return JSON.stringify(result)
  },
})

const SHORTCUT_TOOLS = [getShortcutStoryTool, searchShortcutStoriesTool]
const SENTRY_TOOLS = [getSentryIssueTool, searchSentryIssuesTool]
const DRIVE_TOOLS = [searchDriveFilesTool, getDriveFileTool, listDriveFilesTool]
const NOTION_TOOLS = [searchNotionPagesTool, getNotionPageTool]
const HELPJUICE_TOOLS = [searchHelpjuiceArticlesTool, getHelpjuiceArticleTool]
const POSTGRES_TOOLS = [listDatabaseSchemasTool, listDatabaseTablesTool, describeDatabaseTableTool, queryDatabaseTool]
const SHOPIFY_TOOLS = [
  getShopifyOrderTool,
  searchShopifyOrdersTool,
  getShopifyProductTool,
  getShopifyWebhooksTool,
  shopifyGraphqlQueryTool,
]

export const allTools = [
  listReposTool,
  getDirectoryContentsTool,
  getFileContentsTool,
  searchCodeTool,
  findFilesTool,
  gitLogFileTool,
  gitBlameTool,
]

export function buildAgentTools(
  policy,
  {
    shortcutConfigured = false,
    sentryConfigured = false,
    driveConfigured = false,
    notionConfigured = false,
    helpjuiceConfigured = false,
    postgresConfigured = false,
    shopifyConfigured = false,
  } = {}
) {
  const shortcutTools = shortcutConfigured ? SHORTCUT_TOOLS : []
  const sentryTools = sentryConfigured ? SENTRY_TOOLS : []
  const driveTools = driveConfigured ? DRIVE_TOOLS : []
  const notionTools = notionConfigured ? NOTION_TOOLS : []
  const helpjuiceTools = helpjuiceConfigured ? HELPJUICE_TOOLS : []
  const postgresTools = postgresConfigured ? POSTGRES_TOOLS : []
  const shopifyTools = shopifyConfigured ? SHOPIFY_TOOLS : []
  let tools
  if (!policy || policy.unrestricted) {
    tools = [
      ...allTools,
      ...shortcutTools,
      ...sentryTools,
      ...driveTools,
      ...notionTools,
      ...helpjuiceTools,
      ...postgresTools,
      ...shopifyTools,
    ]
  } else {
    tools = []
    if (policy.repos.length > 0) {
      tools.push(...buildRepoTools(policy.repos))
    }
    for (const id of policy.integrations) {
      if (id === 'google-drive') {
        tools.push(...driveTools)
      } else if (id === 'notion') {
        tools.push(...notionTools)
      } else if (id === 'helpjuice') {
        tools.push(...helpjuiceTools)
      } else if (id === 'postgres') {
        tools.push(...postgresTools)
      } else if (id === 'shopify') {
        tools.push(...shopifyTools)
      }
    }
    tools.push(...shortcutTools, ...sentryTools)
  }

  return tools
}
