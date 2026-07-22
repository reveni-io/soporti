import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env'), quiet: true })

function required(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required environment variable: ${name}`)
    console.error(`Copy .env.example to .env and fill in the values.`)
    process.exit(1)
  }
  return value
}

function parseCsvList(value) {
  if (!value) return []
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

const config = {
  port: parseInt(process.env.PORT || '3001', 10),

  // OpenAI settings (API key, model, vector store id) are NOT env vars: they
  // live in the database (app_config), configured from the admin panel (OpenAI
  // section) — see openai/settings.js. The database is the single source of
  // truth.

  // The GitHub token is NOT an env var: it lives in the database
  // (app_config), configured from the admin panel (GitHub section) — see
  // github/settings.js.

  google: {
    // The Google Sign-In client id and the allowed sign-in domains are NOT env
    // vars: they live in the database (app_config), edited from the admin panel
    // (Authentication section) — see auth/google-settings.js and
    // auth/allowed-domains.js. VITE_GOOGLE_CLIENT_ID stays an env var (baked
    // into the frontend build) and must match the admin value.

    // Read-only Google Drive integration (service account, folder-scoped via
    // Drive sharing). The service-account credential is NOT an env var: it lives
    // in the database (app_config), edited from the admin panel (Google Drive
    // section) — see google-drive/settings.js. Only the tunables below are env.
    drive: {
      maxBytes: parseInt(process.env.GOOGLE_DRIVE_MAX_BYTES || String(25 * 1024 * 1024), 10) || 25 * 1024 * 1024,
      maxChars: parseInt(process.env.GOOGLE_DRIVE_MAX_CHARS || '50000', 10) || 50000,
      downloadTimeoutMs: parseInt(process.env.GOOGLE_DRIVE_DOWNLOAD_TIMEOUT_MS || '60000', 10) || 60000,
      parseConcurrency: parseInt(process.env.GOOGLE_DRIVE_PARSE_CONCURRENCY || '2', 10) || 2,
    },
  },

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  security: {
    // Browser origins allowed by CORS (CSV). Empty = any origin ('*').
    corsOrigins: parseCsvList(process.env.CORS_ORIGIN),
    // Express 'trust proxy'. '1' (default) trusts one reverse proxy in front,
    // so req.ip — the rate-limit key — comes from X-Forwarded-For. Set to
    // 'false' when clients connect directly, otherwise they can spoof the
    // header and evade the per-IP login rate limit.
    trustProxy: process.env.TRUST_PROXY ?? '1',
  },

  // Application database (stores authenticated users). Separate from the
  // agent's read-only `postgres` query tool, whose connection string lives in
  // the database (app_config), configured from the admin panel (Database
  // section) — see postgres/settings.js.
  database: {
    url: required('DATABASE_URL'),
  },

  // The Shortcut API token is NOT an env var: it lives in the database
  // (app_config), configured from the admin panel (Shortcut section) — see
  // shortcut/settings.js. The database is the single source of truth.

  // The Notion token is NOT an env var: it lives in the database (app_config),
  // configured from the admin panel (Notion section) — see notion/settings.js.
  // The database is the single source of truth.

  // The agent's read-only PostgreSQL query connection is NOT an env var either:
  // it lives in the database (app_config), configured from the admin panel
  // (Database section) — see postgres/settings.js.

  // The Helpjuice credentials (API key and account subdomain) are NOT env
  // vars: they live in the database (app_config), configured from the admin
  // panel (Helpjuice section) — see helpjuice/settings.js. The database is the
  // single source of truth.

  // The Sentry credentials (auth token and organization slug) are NOT env
  // vars: they live in the database (app_config), configured from the admin
  // panel (Sentry section) — see sentry/settings.js. The database is the single
  // source of truth.

  // The Slack bot credentials (bot token, app token, signing secret) are NOT
  // env vars: they live in the database (app_config), configured from the admin
  // panel (Slack section) — see slack/settings.js. The database is the single
  // source of truth, and the bot reconnects in place when they change.

  // Auto-diagnose of support tickets. Soporti
  // polls a Slack List of tickets and writes a diagnosis into a per-item field.
  // Enabled only when SLACK_AUTODIAGNOSE_LIST_ID is set (and Slack is
  // configured). Needs new bot scopes: lists:read, lists:write, files:read.
  autoDiagnose: {
    enabled: Boolean(process.env.SLACK_AUTODIAGNOSE_LIST_ID),
    listId: process.env.SLACK_AUTODIAGNOSE_LIST_ID || '',
    // The diagnosis column. Resolve by name by default; set the id to override
    // when the name lookup cannot find it.
    columnId: process.env.SLACK_AUTODIAGNOSE_COLUMN_ID || '',
    columnName: process.env.SLACK_AUTODIAGNOSE_COLUMN_NAME || 'Diagnosis',
    // 'tech' so the diagnosis can include concrete fixes with code references;
    // the prompt still carves out a plain-language support section.
    profile: process.env.SLACK_AUTODIAGNOSE_PROFILE || 'tech',
    pollIntervalMs: parseInt(process.env.SLACK_AUTODIAGNOSE_POLL_MS || '60000', 10) || 60000,
    maxItemsPerPoll: parseInt(process.env.SLACK_AUTODIAGNOSE_MAX_ITEMS || '5', 10) || 5,
    // Skip the historical backlog: archived/closed tickets, and (when set) any
    // ticket created before this cutoff. Set SKIP_BEFORE to the go-live time so
    // only NEW tickets are diagnosed; leave empty to diagnose the whole backlog.
    skipArchived: process.env.SLACK_AUTODIAGNOSE_SKIP_ARCHIVED !== 'false',
    skipBefore: process.env.SLACK_AUTODIAGNOSE_SKIP_BEFORE || '',
    maxAttachmentBytes:
      parseInt(process.env.SLACK_AUTODIAGNOSE_MAX_ATTACHMENT_BYTES || String(5 * 1024 * 1024), 10) || 5 * 1024 * 1024,
  },

  agent: {
    maxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS || '20', 10),
  },

  repoPool: {
    maxSize: parseInt(process.env.REPO_POOL_MAX_SIZE || '20', 10),
    ttlMs: parseInt(process.env.REPO_POOL_TTL_MS || String(30 * 60_000), 10),
    cleanupMs: parseInt(process.env.REPO_POOL_CLEANUP_MS || String(5 * 60_000), 10),
  },

  // PR reviews via GitHub webhooks. The webhook secret is NOT an env var: it
  // lives in the database (app_config), managed from the admin panel (GitHub
  // section) — the feature activates when it is set there. The values below
  // are optional tunables with sensible defaults.
  review: {
    label: process.env.REVIEW_LABEL || 'soporti-review',
    // GitHub login whose review requests trigger Soporti. Resolved from the
    // token at boot when empty.
    reviewerLogin: process.env.REVIEW_REVIEWER_LOGIN || '',
    maxChangedLines: parseInt(process.env.REVIEW_MAX_CHANGED_LINES || '4000', 10) || 4000,
    concurrency: parseInt(process.env.REVIEW_CONCURRENCY || '1', 10) || 1,
    // Reasoning effort for the reviewer agent. Applied only when the
    // DB-configured model is a reasoning model (gpt-5*/o*). Set empty to use
    // the API default.
    reasoningEffort: process.env.REVIEW_REASONING_EFFORT ?? 'high',
  },
}

// Sessions are only as strong as the signing secret. Refuse to boot with the
// .env.example placeholder (anyone could forge admin tokens) and warn loudly
// on short secrets.
if (config.jwt.secret === 'change-me-to-a-long-random-string') {
  console.error('JWT_SECRET is still the .env.example placeholder. Set a real secret (e.g. `openssl rand -hex 32`).')
  process.exit(1)
}
if (config.jwt.secret.length < 32) {
  console.warn('[config] JWT_SECRET is shorter than 32 characters — consider a longer secret (`openssl rand -hex 32`).')
}

export default config
