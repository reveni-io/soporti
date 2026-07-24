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

  google: {
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
    corsOrigins: parseCsvList(process.env.CORS_ORIGIN),
    trustProxy: process.env.TRUST_PROXY ?? '1',
  },

  database: {
    url: required('DATABASE_URL'),
  },

  autoDiagnose: {
    enabled: Boolean(process.env.SLACK_AUTODIAGNOSE_LIST_ID),
    listId: process.env.SLACK_AUTODIAGNOSE_LIST_ID || '',
    columnId: process.env.SLACK_AUTODIAGNOSE_COLUMN_ID || '',
    columnName: process.env.SLACK_AUTODIAGNOSE_COLUMN_NAME || 'Diagnosis',
    profile: process.env.SLACK_AUTODIAGNOSE_PROFILE || 'tech',
    pollIntervalMs: parseInt(process.env.SLACK_AUTODIAGNOSE_POLL_MS || '60000', 10) || 60000,
    maxItemsPerPoll: parseInt(process.env.SLACK_AUTODIAGNOSE_MAX_ITEMS || '5', 10) || 5,
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

  review: {
    label: process.env.REVIEW_LABEL || 'soporti-review',
    reviewerLogin: process.env.REVIEW_REVIEWER_LOGIN || '',
    maxChangedLines: parseInt(process.env.REVIEW_MAX_CHANGED_LINES || '4000', 10) || 4000,
    concurrency: parseInt(process.env.REVIEW_CONCURRENCY || '1', 10) || 1,
    reasoningEffort: process.env.REVIEW_REASONING_EFFORT ?? 'high',
  },
}

if (config.jwt.secret === 'change-me-to-a-long-random-string') {
  console.error('JWT_SECRET is still the .env.example placeholder. Set a real secret (e.g. `openssl rand -hex 32`).')
  process.exit(1)
}
if (config.jwt.secret.length < 32) {
  console.warn('[config] JWT_SECRET is shorter than 32 characters — consider a longer secret (`openssl rand -hex 32`).')
}

export default config
