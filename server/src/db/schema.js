import { pgTable, serial, text, timestamp, integer, jsonb, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core'

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

export const schedules = pgTable(
  'schedules',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    sources: jsonb('sources').notNull(),
    profile: text('profile').notNull(),
    frequency: text('frequency').notNull(),
    minute: integer('minute').notNull(),
    hour: integer('hour'),
    weekday: integer('weekday'),
    monthDay: integer('month_day'),
    timezone: text('timezone').notNull(),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    lastStatus: text('last_status'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('schedules_next_run_idx').on(table.nextRunAt)]
)

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    source: text('source').notNull(),
    userId: integer('user_id').references(() => users.id),
    scheduleId: integer('schedule_id').references(() => schedules.id, { onDelete: 'set null' }),
    slackChannelId: text('slack_channel_id'),
    slackThreadTs: text('slack_thread_ts'),
    lastResponseId: text('openai_last_response_id'),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('conversations_slack_thread_idx').on(table.slackChannelId, table.slackThreadTs),
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

export const granolaCredentials = pgTable('granola_credentials', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  apiKey: text('api_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const attachmentImages = pgTable(
  'attachment_images',
  {
    id: uuid('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mimeType: text('mime_type').notNull(),
    data: text('data').notNull(),
    byteSize: integer('byte_size').notNull(),
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
