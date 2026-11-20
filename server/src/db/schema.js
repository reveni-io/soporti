import { sql } from 'drizzle-orm'
import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  uuid,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core'

const bytea = customType({
  dataType() {
    return 'bytea'
  },
})

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  googleId: text('google_id').unique(),
  slackId: text('slack_id').unique(),
  email: text('email').unique(),
  name: text('name'),
  picture: text('picture'),
  role: text('role').notNull().default('user'),
  passwordHash: text('password_hash'),
  customInstructions: text('custom_instructions'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
})

export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const bots = pgTable(
  'bots',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    profile: text('profile').notNull(),
    avatarSeed: text('avatar_seed').notNull(),
    avatarStyle: jsonb('avatar_style'),
    unreadCount: integer('unread_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('bots_user_idx').on(table.userId)]
)

export const schedules = pgTable(
  'schedules',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    botId: integer('bot_id').references(() => bots.id, { onDelete: 'cascade' }),
    title: text('title'),
    question: text('question').notNull(),
    sources: jsonb('sources').notNull(),
    profile: text('profile').notNull(),
    frequency: text('frequency').notNull(),
    minute: integer('minute').notNull(),
    hour: integer('hour'),
    weekday: integer('weekday'),
    monthDay: integer('month_day'),
    runDate: text('run_date'),
    timezone: text('timezone').notNull(),
    paused: boolean('paused').notNull().default(false),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    lastStatus: text('last_status'),
    lastError: text('last_error'),
    lastResult: text('last_result'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('schedules_next_run_idx').on(table.nextRunAt), index('schedules_bot_idx').on(table.botId)]
)

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    source: text('source').notNull(),
    userId: integer('user_id').references(() => users.id),
    scheduleId: integer('schedule_id').references(() => schedules.id, { onDelete: 'set null' }),
    botId: integer('bot_id').references(() => bots.id, { onDelete: 'cascade' }),
    slackChannelId: text('slack_channel_id'),
    slackThreadTs: text('slack_thread_ts'),
    lastResponseId: text('openai_last_response_id'),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('conversations_slack_thread_idx').on(table.slackChannelId, table.slackThreadTs),
    uniqueIndex('conversations_bot_idx').on(table.botId),
    index('conversations_created_idx').on(table.createdAt),
  ]
)

export const conversationItems = pgTable(
  'conversation_items',
  {
    id: serial('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    item: jsonb('item').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('conversation_items_conversation_seq_idx').on(table.conversationId, table.seq)]
)

export const conversationMessages = pgTable(
  'conversation_messages',
  {
    id: serial('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    parts: jsonb('parts').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('conversation_messages_conversation_idx').on(table.conversationId, table.createdAt),
    index('conversation_messages_created_idx').on(table.createdAt),
  ]
)

export const shares = pgTable('shares', {
  id: text('id').primaryKey(),
  conversationId: uuid('conversation_id')
    .notNull()
    .unique()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  messageCutoffId: integer('message_cutoff_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: serial('id').primaryKey(),
    channel: text('channel').notNull(),
    status: text('status').notNull(),
    subject: text('subject'),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    requests: integer('requests').notNull().default(0),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    durationMs: integer('duration_ms').notNull().default(0),
    tools: jsonb('tools').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('agent_runs_created_idx').on(table.createdAt), index('agent_runs_channel_idx').on(table.channel)]
)

export const apiKeys = pgTable(
  'api_keys',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    sources: jsonb('sources').notNull().default([]),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('api_keys_user_idx').on(table.userId)]
)

export const oauthClients = pgTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  name: text('name').notNull(),
  redirectUris: jsonb('redirect_uris').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const oauthCodes = pgTable(
  'oauth_codes',
  {
    id: serial('id').primaryKey(),
    codeHash: text('code_hash').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    redirectUri: text('redirect_uri').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    scope: text('scope').notNull(),
    resource: text('resource'),
    usedAt: timestamp('used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('oauth_codes_expires_idx').on(table.expiresAt)]
)

export const oauthRefreshTokens = pgTable(
  'oauth_refresh_tokens',
  {
    id: serial('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    rotatedFromId: integer('rotated_from_id'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('oauth_refresh_tokens_user_client_idx').on(table.userId, table.clientId)]
)

export const granolaCredentials = pgTable('granola_credentials', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  apiKey: text('api_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const googleConnections = pgTable('google_connections', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  refreshToken: text('refresh_token').notNull(),
  scopes: text('scopes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('push_subscriptions_user_idx').on(table.userId)]
)

export const zendeskConnections = pgTable('zendesk_connections', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  subdomain: text('subdomain').notNull(),
  email: text('email').notNull(),
  apiToken: text('api_token').notNull(),
  writesEnabled: boolean('writes_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sendcloudAccounts = pgTable(
  'sendcloud_accounts',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    publicKey: text('public_key').notNull(),
    secretKey: text('secret_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('sendcloud_accounts_name_lower_idx').on(sql`lower(${table.name})`)]
)

export const postgresConnections = pgTable(
  'postgres_connections',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    connectionString: text('connection_string').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('postgres_connections_name_lower_idx').on(sql`lower(${table.name})`)]
)

export const attachmentImages = pgTable(
  'attachment_images',
  {
    id: uuid('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mimeType: text('mime_type').notNull(),
    data: bytea('data').notNull(),
    thumbnail: text('thumbnail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  table => [
    index('attachment_images_user_idx').on(table.userId),
    index('attachment_images_expires_idx').on(table.expiresAt),
  ]
)

export const skills = pgTable(
  'skills',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    instructions: text('instructions').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('skills_user_name_idx').on(table.userId, table.name)]
)

export const subagents = pgTable(
  'subagents',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    instructions: text('instructions').notNull(),
    provider: text('provider'),
    model: text('model'),
    tools: jsonb('tools').notNull().default([]),
    exclusive: boolean('exclusive').notNull().default(false),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('subagents_name_idx').on(table.name)]
)

export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    identifier: text('identifier').notNull(),
    title: text('title').notNull(),
    latestVersion: integer('latest_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('artifacts_conversation_identifier_idx').on(table.conversationId, table.identifier)]
)

export const artifactVersions = pgTable(
  'artifact_versions',
  {
    id: serial('id').primaryKey(),
    artifactId: uuid('artifact_id')
      .notNull()
      .references(() => artifacts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    html: text('html').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('artifact_versions_artifact_version_idx').on(table.artifactId, table.version)]
)

export const artifactShares = pgTable(
  'artifact_shares',
  {
    id: text('id').primaryKey(),
    artifactId: uuid('artifact_id')
      .notNull()
      .references(() => artifacts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  table => [uniqueIndex('artifact_shares_artifact_version_idx').on(table.artifactId, table.version)]
)

export const videos = pgTable(
  'videos',
  {
    id: uuid('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    brief: jsonb('brief').notNull(),
    storyboard: jsonb('storyboard'),
    stage: text('stage').notNull(),
    storyboardError: text('storyboard_error'),
    parentVideoId: uuid('parent_video_id').references(() => videos.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => {
    return [
      index('videos_user_created_idx').on(table.userId, table.createdAt),
      index('videos_stage_idx').on(table.stage),
    ]
  }
)

export const videoMessages = pgTable(
  'video_messages',
  {
    id: serial('id').primaryKey(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    version: integer('version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('video_messages_video_idx').on(table.videoId)]
)

export const videoVersions = pgTable(
  'video_versions',
  {
    id: serial('id').primaryKey(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    phase: text('phase'),
    progress: integer('progress'),
    step: text('step'),
    etaSeconds: integer('eta_seconds'),
    events: jsonb('events').notNull().default([]),
    request: text('request'),
    basedOn: integer('based_on'),
    summary: text('summary'),
    error: text('error'),
    resume: boolean('resume').notNull().default(false),
    cancelRequested: boolean('cancel_requested').notNull().default(false),
    attempts: integer('attempts').notNull().default(0),
    previewReady: boolean('preview_ready').notNull().default(false),
    durationMs: integer('duration_ms'),
    sizeBytes: integer('size_bytes'),
    mp4: bytea('mp4'),
    thumbnail: bytea('thumbnail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  table => [
    uniqueIndex('video_versions_video_version_idx').on(table.videoId, table.version),
    index('video_versions_status_queued_idx').on(table.status, table.queuedAt),
  ]
)

export const videoFiles = pgTable(
  'video_files',
  {
    id: serial('id').primaryKey(),
    versionId: integer('version_id')
      .notNull()
      .references(() => videoVersions.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    content: text('content').notNull(),
  },
  table => [uniqueIndex('video_files_version_path_idx').on(table.versionId, table.path)]
)

export const videoAssets = pgTable(
  'video_assets',
  {
    id: serial('id').primaryKey(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mimeType: text('mime_type').notNull(),
    data: bytea('data').notNull(),
    sha256: text('sha256').notNull(),
  },
  table => [uniqueIndex('video_assets_video_name_idx').on(table.videoId, table.name)]
)

export const videoFrames = pgTable(
  'video_frames',
  {
    id: serial('id').primaryKey(),
    versionId: integer('version_id')
      .notNull()
      .references(() => videoVersions.id, { onDelete: 'cascade' }),
    times: jsonb('times').notNull(),
    image: bytea('image').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('video_frames_version_idx').on(table.versionId)]
)

export const videoShares = pgTable(
  'video_shares',
  {
    id: text('id').primaryKey(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  table => [uniqueIndex('video_shares_video_version_idx').on(table.videoId, table.version)]
)

export const analyticsDashboards = pgTable(
  'analytics_dashboards',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    shared: boolean('shared').notNull().default(false),
  },
  table => {
    return [
      index('analytics_dashboards_user_created_idx').on(table.userId, table.createdAt),
      index('analytics_dashboards_shared_idx').on(table.shared),
    ]
  }
)

export const analyticsCards = pgTable(
  'analytics_cards',
  {
    id: uuid('id').primaryKey(),
    dashboardId: uuid('dashboard_id')
      .notNull()
      .references(() => analyticsDashboards.id, { onDelete: 'cascade' }),
    prompt: text('prompt').notNull(),
    title: text('title').notNull(),
    sql: text('sql'),
    chart: jsonb('chart'),
    connectionId: integer('connection_id').references(() => postgresConnections.id, { onDelete: 'set null' }),
    layout: jsonb('layout').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status').notNull(),
    step: text('step'),
    error: text('error'),
  },
  table => {
    return [
      index('analytics_cards_dashboard_created_idx').on(table.dashboardId, table.createdAt),
      index('analytics_cards_status_idx').on(table.status),
    ]
  }
)

export const jevDocuments = pgTable('jev_documents', {
  id: text('id').primaryKey(),
  rev: integer('rev').notNull(),
  data: jsonb('data').notNull(),
  setVersion: integer('set_version').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const jevSetVersions = pgTable(
  'jev_set_versions',
  {
    id: serial('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => jevDocuments.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    set: jsonb('set').notNull(),
    authorEmail: text('author_email').notNull(),
    change: text('change').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('jev_set_versions_document_version_idx').on(table.documentId, table.version)]
)

export const jevHistory = pgTable(
  'jev_history',
  {
    id: serial('id').primaryKey(),
    documentId: text('document_id').notNull(),
    rev: integer('rev'),
    authorEmail: text('author_email').notNull(),
    change: text('change').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('jev_history_document_created_idx').on(table.documentId, table.createdAt)]
)

export const jevCalls = pgTable(
  'jev_calls',
  {
    id: serial('id').primaryKey(),
    project: text('project').notNull(),
    setVersion: integer('set_version').notNull(),
    model: text('model').notNull(),
    answeredModel: text('answered_model'),
    status: text('status').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('jev_calls_project_created_idx').on(table.project, table.createdAt)]
)

export const legalCases = pgTable(
  'legal_cases',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    guardId: text('guard_id').notNull(),
    scheduleId: integer('schedule_id').references(() => schedules.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    source: text('source').notNull(),
    ticketId: text('ticket_id').notNull(),
    messageHash: text('message_hash').notNull(),
    ticketUrl: text('ticket_url'),
    customer: text('customer').notNull(),
    subject: text('subject').notNull(),
    customerMessage: text('customer_message').notNull(),
    dataFacts: jsonb('data_facts'),
    draft: jsonb('draft'),
    language: text('language'),
    status: text('status').notNull(),
    reason: text('reason'),
    setVersion: integer('set_version'),
    jev: jsonb('jev'),
    warnings: integer('warnings').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('legal_cases_user_idx').on(table.userId), index('legal_cases_created_idx').on(table.createdAt)]
)

export const legalReplies = pgTable(
  'legal_replies',
  {
    id: serial('id').primaryKey(),
    caseId: integer('case_id')
      .notNull()
      .references(() => legalCases.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    sentBy: text('sent_by').notNull(),
    text: text('text').notNull(),
    externalId: text('external_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('legal_replies_case_idx').on(table.caseId)]
)
