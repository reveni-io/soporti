import { Agent, run } from '@openai/agents'
import { resolveModelForAgent, codexModelSettings } from '../openai/client.js'
import { listDatabaseSchemasTool, listDatabaseTablesTool, describeDatabaseTableTool } from '../agent/tools.js'
import { STORE_PLACEHOLDER } from './settings.js'
import config from '../config.js'

// Drafts the Shopify store token query by letting a restricted agent explore
// the connected read-only database. The agent gets ONLY the schema tools — no
// query_database — so credential values can never enter its context: it
// returns SQL text for the admin to review and save, and never executes it.

const NOT_FOUND_PREFIX = 'NOT_FOUND:'

const DRAFTER_INSTRUCTIONS = `You are Soporti, drafting configuration for the Shopify integration. Explore the connected read-only PostgreSQL database with your schema tools and find where Shopify store credentials are stored: a long-lived Admin API access token and the store's *.myshopify.com domain. They may be spread across joined tables (e.g. django-allauth's socialaccount_socialaccount and socialaccount_socialtoken plus a store table, or a single custom table).

Then write ONE PostgreSQL SELECT statement that resolves a store identifier to its credentials:
- Use the literal placeholder ${STORE_PLACEHOLDER} where the store identifier goes. It is replaced with a quoted SQL string literal at runtime.
- The query must return one row with columns named "domain" and "token" (alias other column names to these) and end with LIMIT 1.
- Read-only SELECT only. Never write anything.

Matching rules — the lookup runs unattended, so a wrong match silently exposes another store's data:
- Match ONLY identifier columns of the store entity itself (its primary key and uuid, compared as text, e.g. id::text = ${STORE_PLACEHOLDER}), its domain/hostname columns, and the provider uid. NEVER match display-name columns (name, title, internal_name and similar): a fuzzy name match with LIMIT 1 can resolve the wrong store. NEVER match ids or foreign keys of joined internal tables (e.g. the social account's own id): numeric ids collide across tables, so such a branch can return another store even when the right one exists.
- The identifier may arrive as a full URL or a *.myshopify.com domain, so normalize it when matching domain columns: column ILIKE '%' || replace(replace(replace(${STORE_PLACEHOLDER}, 'https://', ''), 'http://', ''), '.myshopify.com', '') || '%'.
- When tables distinguish providers or token types, filter strictly with AND on the table that owns the token (e.g. provider = 'shopify'), so a token from another provider can never be returned.

Rules:
- Use ONLY the schema tools (list schemas, list tables, describe table) to inspect structure. Never try to read credential values.
- If you cannot find any table holding Shopify credentials, reply with exactly: ${NOT_FOUND_PREFIX} <one short sentence saying what you looked for>.
- Otherwise reply with ONLY the SQL statement — no markdown fences, no commentary, no trailing semicolon.`

// Models sometimes wrap SQL in ```sql fences despite instructions.
function stripFences(text) {
  return text
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

// Returns { found: true, query } or { found: false, explanation }.
export async function draftShopifyTokenQuery() {
  const model = await resolveModelForAgent()
  const codexSettings = codexModelSettings(model)

  const agent = new Agent({
    name: 'Soporti',
    model,
    instructions: DRAFTER_INSTRUCTIONS,
    tools: [listDatabaseSchemasTool, listDatabaseTablesTool, describeDatabaseTableTool],
    ...(codexSettings ? { modelSettings: codexSettings } : {}),
  })

  const result = await run(agent, 'Draft the Shopify store token query for this database.', {
    maxTurns: config.agent.maxIterations,
  })

  const output = result?.finalOutput
  const text = (typeof output === 'string' ? output : '').trim()

  if (!text) {
    return { found: false, explanation: 'The assistant returned no query.' }
  }
  if (text.startsWith(NOT_FOUND_PREFIX)) {
    return { found: false, explanation: text.slice(NOT_FOUND_PREFIX.length).trim() }
  }
  return { found: true, query: stripFences(text) }
}
