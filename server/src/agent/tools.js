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
import * as betterstack from '../betterstack/client.js'
import * as helpjuice from '../helpjuice/client.js'
import * as shopify from '../shopify/client.js'
import * as googleDrive from '../google-drive/client.js'
import * as granola from '../granola/client.js'
import {
  DEFAULT_CONTEXT_LINES,
  DEFAULT_FILE_LINES,
  DEFAULT_FIND_RESULTS,
  MAX_FILE_LINES,
  MAX_FIND_RESULTS,
  MAX_SEARCH_RESULTS,
} from '../constants.js'
import { resolveAvailableIntegrations } from './integrations.js'

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
      description: `Read the contents of a specific file in a repository. Prefer a targeted window over a whole file: whenever you already know the relevant line — from a search_code match, a stacktrace, or git_blame — pass centerLine and you get that line with contextLines on each side. Without centerLine it reads limit lines from offset, starting with the first ${DEFAULT_FILE_LINES}. The response includes totalLines, truncated and nextOffset, so page with nextOffset when a file genuinely has to be read in full rather than answering from a partial read.`,
      parameters: z.object({
        repo: z.string().describe('Full repository name "owner/repo".'),
        path: z.string().describe('File path inside the repo.'),
        centerLine: z
          .number()
          .int()
          .min(1)
          .nullable()
          .default(null)
          .describe(
            '1-based line to read around. When set, offset and limit are ignored. Use it whenever you know it.'
          ),
        contextLines: z
          .number()
          .int()
          .min(0)
          .max(MAX_FILE_LINES)
          .default(DEFAULT_CONTEXT_LINES)
          .describe(
            `Lines to return on each side of centerLine. Default ${DEFAULT_CONTEXT_LINES}. Ignored without centerLine.`
          ),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe('0-based line number to start reading from. Default 0 (start of file).'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_FILE_LINES)
          .default(DEFAULT_FILE_LINES)
          .describe(
            `Max lines to return. Default ${DEFAULT_FILE_LINES}, max ${MAX_FILE_LINES}. Only raise it when a targeted window is not enough.`
          ),
      }),
      execute: guard(async input => {
        const result = await getFileContents(input.repo, input.path, {
          offset: input.offset,
          limit: input.limit,
          centerLine: input.centerLine,
          contextLines: input.contextLines,
        })
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
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(MAX_SEARCH_RESULTS)
          .default(MAX_SEARCH_RESULTS)
          .describe(
            `Max number of matches to return. Default and max ${MAX_SEARCH_RESULTS}. This tool cannot page, and the matches it drops are the ones it happened to reach last — not the least relevant. When the response comes back truncated, narrow the query or the path glob and search again instead of treating the list as complete.`
          ),
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
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(MAX_FIND_RESULTS)
          .default(DEFAULT_FIND_RESULTS)
          .describe(
            `Max number of files to return. Default ${DEFAULT_FIND_RESULTS}. Tighten the pattern before raising it; the response reports totalCount and truncated.`
          ),
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
  description: `Search Shortcut stories by text and/or filters. Returns each story with its state, owners, epic, iteration, estimate and labels, plus the total number of matches so you can tell when the result is partial.

The query supports Shortcut search operators, which are far more precise than free text. Combine them freely:
- \`owner:mention_name\` / \`requester:mention_name\` — by person. Resolve the mention_name with list_shortcut_members first; never guess it.
- \`iteration:"Sprint 12"\` / \`epic:"Checkout redesign"\` — exact names. Resolve them with list_shortcut_iterations or list_shortcut_epics first. To list a whole sprint prefer get_shortcut_iteration_stories, which is not capped by search paging.
- \`state:"In Progress"\`, \`type:bug|feature|chore\`, \`label:"frontend"\`, \`estimate:3\`, \`team:"Platform"\`
- \`is:done\`, \`is:started\`, \`is:unstarted\`, \`is:blocked\`, \`has:owner\`, and their negations with \`!\` (e.g. \`!is:done\`)
- \`created:2026-01-01..2026-03-01\`, \`updated:\`, \`completed:\`, \`due:\`

Example: \`owner:sergio !is:done type:bug\` for someone's open bugs.`,
  parameters: z.object({
    query: z.string().describe('Free text, Shortcut search operators, or both.'),
    limit: z.number().optional().describe('Maximum stories to return (default 25, maximum 100).'),
  }),
  execute: async input => {
    const result = await shortcut.searchStories(input.query, { limit: input.limit })
    return JSON.stringify(result)
  },
})

export const listShortcutIterationsTool = tool({
  name: 'list_shortcut_iterations',
  description:
    'List Shortcut iterations (sprints), most recent first, with their ID, name, status and dates. Use it to resolve which sprint the user means — "the current sprint" is the one with status "started" — before asking for its stories.',
  parameters: z.object({
    status: z
      .enum(['started', 'unstarted', 'done'])
      .nullable()
      .describe('Filter by status: "started" is the current sprint, "unstarted" upcoming. Null for all of them.'),
  }),
  execute: async input => {
    const result = await shortcut.listIterations({ status: input.status ?? undefined })
    return JSON.stringify(result)
  },
})

export const getShortcutIterationStoriesTool = tool({
  name: 'get_shortcut_iteration_stories',
  description:
    'Get every story in a Shortcut iteration (sprint) by its numeric iteration ID, with a count of stories per workflow state. Use this for sprint questions ("what is in this sprint", "what is left", "who is working on what") instead of search. Get the ID from list_shortcut_iterations.',
  parameters: z.object({
    iterationId: z.number().describe('Numeric iteration ID from list_shortcut_iterations.'),
  }),
  execute: async input => {
    const result = await shortcut.getIterationStories(input.iterationId)
    return JSON.stringify(result)
  },
})

export const listShortcutEpicsTool = tool({
  name: 'list_shortcut_epics',
  description:
    'List Shortcut epics with their ID, name, status, deadline and story counts per state. Use it to answer questions about epics and to get an exact epic name for the epic: operator in search_shortcut_stories.',
  parameters: z.object({
    status: z
      .enum(['to do', 'in progress', 'done'])
      .nullable()
      .describe('Filter by epic status. Null for all of them.'),
  }),
  execute: async input => {
    const result = await shortcut.listEpics({ status: input.status ?? undefined })
    return JSON.stringify(result)
  },
})

export const listShortcutMembersTool = tool({
  name: 'list_shortcut_members',
  description:
    'List the active Shortcut members with their name and mention_name. Use it to turn a person the user names ("Sergio", "Ana") into the mention_name required by the owner: and requester: search operators.',
  parameters: z.object({}),
  execute: async () => {
    const result = await shortcut.listMembers()
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

export const listLogSourcesTool = tool({
  name: 'list_log_sources',
  description:
    'List the log sources available in Better Stack. Call this first: it returns each source name, platform, retention in days, and the table prefix to use in query_logs.',
  parameters: z.object({}),
  execute: async () => {
    const sources = await betterstack.listSources()
    return JSON.stringify(sources)
  },
})

export const describeLogSourceTool = tool({
  name: 'describe_log_source',
  description:
    'Describe the columns and types of a log source table in Better Stack. Use it before writing a query_logs query against an unfamiliar source.',
  parameters: z.object({
    source: z.string().describe('Log source name as returned by list_log_sources.'),
  }),
  execute: async input => {
    const schema = await betterstack.describeSource(input.source)
    return JSON.stringify(schema)
  },
})

export const searchLogsTool = tool({
  name: 'search_logs',
  description:
    'Search the log lines of a Better Stack source for a case-insensitive text fragment (an error message, a request id, an email, a status code). This is the fastest way to find matching logs. Returns the newest matches first, each with its timestamp and raw log line (a JSON string, truncated when very long).',
  parameters: z.object({
    source: z.string().describe('Log source name as returned by list_log_sources.'),
    query: z.string().describe('Text fragment to look for inside the log line.'),
    from: z
      .string()
      .optional()
      .describe('Start of the time range as an ISO 8601 timestamp. Defaults to 24 hours before "to".'),
    to: z.string().optional().describe('End of the time range as an ISO 8601 timestamp. Defaults to now.'),
    limit: z.number().optional().describe('Maximum log lines to return (default 25, maximum 100).'),
  }),
  execute: async input => {
    const result = await betterstack.searchLogs(input)
    return JSON.stringify(result)
  },
})

export const queryLogsTool = tool({
  name: 'query_logs',
  description:
    "Execute a read-only ClickHouse SQL query against Better Stack logs. Use it for aggregates search_logs cannot express: counts per level, errors grouped by endpoint, occurrences per hour. Only SELECT and WITH (CTE) queries are allowed and results are capped at 100 rows. Take the table prefix from list_log_sources and read recent data with remote(<prefix>_logs) or historical data with s3Cluster(primary, <prefix>_s3) WHERE _row_type = 1. Available columns are dt (timestamp) and raw (the log line as a JSON string): extract fields with JSONExtractString(raw, 'level'). Always filter by dt and never add a FORMAT clause.",
  parameters: z.object({
    sql: z.string().describe('ClickHouse SELECT query to execute.'),
  }),
  execute: async input => {
    const result = await betterstack.runQuery(input.sql)
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

export function buildGranolaTools(userId) {
  return [
    tool({
      name: 'search_granola_notes',
      description: `Find the user's own Granola meeting notes. Granola has no full-text search, so this scans the most recent notes and matches the query against the **note title and the owner's name/email only** — never against the body or the transcript. Keep queries short (a company name, a person, a project) and read the promising notes with get_granola_note to see what was actually discussed. Use createdAfter/createdBefore when the user places the meeting in time ("last week's call"). With an empty query it simply returns the most recent notes, which is the right way to answer "what meetings did I have?". Returns up to ${granola.MAX_SEARCH_RESULTS} notes plus how many were scanned; when \`truncated\` is true the scan stopped before the end of the account, so narrow the query or the date range instead of treating the list as complete.`,
      parameters: z.object({
        query: z
          .string()
          .default('')
          .describe('Words to match in the note title or owner. Empty string returns the most recent notes.'),
        createdAfter: z
          .string()
          .nullable()
          .default(null)
          .describe('Only notes created after this ISO 8601 date or datetime.'),
        createdBefore: z
          .string()
          .nullable()
          .default(null)
          .describe('Only notes created before this ISO 8601 date or datetime.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(granola.MAX_SEARCH_RESULTS)
          .default(granola.DEFAULT_SEARCH_RESULTS)
          .describe(
            `Maximum notes to return. Default ${granola.DEFAULT_SEARCH_RESULTS}, maximum ${granola.MAX_SEARCH_RESULTS}.`
          ),
      }),
      execute: async input => {
        const result = await granola.searchNotes(userId, input)
        return JSON.stringify(result)
      },
    }),
    tool({
      name: 'get_granola_note',
      description:
        'Read one of the user\'s Granola meeting notes by ID. Returns the AI summary, attendees, the calendar event and the note url — cite that url in your answer. Set includeTranscript only when the user needs literal quotes or a level of detail the summary does not carry: transcripts are long, and a "notice" field in the response means it was too large to return, so answer from the summary instead of inventing quotes. Notes still being processed by Granola have no summary yet and cannot be read.',
      parameters: z.object({
        noteId: z.string().describe('Granola note ID as returned by search_granola_notes (e.g. "not_1d3tmYTlCICgjy").'),
        includeTranscript: z
          .boolean()
          .default(false)
          .describe('Include the full transcript. Only set it when the summary is not enough.'),
      }),
      execute: async input => {
        const note = await granola.getNote(userId, input.noteId, { includeTranscript: input.includeTranscript })
        return JSON.stringify(note)
      },
    }),
  ]
}

const SHORTCUT_TOOLS = [
  getShortcutStoryTool,
  searchShortcutStoriesTool,
  listShortcutIterationsTool,
  getShortcutIterationStoriesTool,
  listShortcutEpicsTool,
  listShortcutMembersTool,
]
const SENTRY_TOOLS = [getSentryIssueTool, searchSentryIssuesTool]
export const BETTERSTACK_TOOLS = [listLogSourcesTool, describeLogSourceTool, searchLogsTool, queryLogsTool]
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

const INTEGRATION_TOOLS = {
  shortcut: SHORTCUT_TOOLS,
  notion: NOTION_TOOLS,
  'google-drive': DRIVE_TOOLS,
  postgres: POSTGRES_TOOLS,
  sentry: SENTRY_TOOLS,
  betterstack: BETTERSTACK_TOOLS,
  helpjuice: HELPJUICE_TOOLS,
  shopify: SHOPIFY_TOOLS,
  granola: ({ userId }) => buildGranolaTools(userId),
}

export function buildAgentTools(policy, configured, context = {}) {
  const integrationTools = resolveAvailableIntegrations(policy, configured).flatMap(id => {
    const entry = INTEGRATION_TOOLS[id]
    if (!entry) return []

    return typeof entry === 'function' ? entry(context) : entry
  })

  if (!policy || policy.unrestricted) return [...allTools, ...integrationTools]

  const repoTools = policy.repos.length > 0 ? buildRepoTools(policy.repos) : []

  return [...repoTools, ...integrationTools]
}
