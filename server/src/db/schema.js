import { pgTable, serial, text, timestamp, integer, jsonb, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core'

// Authenticated users. Populated on Google sign-in (web), first Slack
// interaction (bot), or created by an admin with a password. Identities are
// unified by email: one row per person, which may carry both a passwordHash
// and a googleId. Slack identities have no email so they stay as separate rows.
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  googleId: text('google_id').unique(),
  slackId: text('slack_id').unique(),
  email: text('email').unique(),
  name: text('name'),
  picture: text('picture'),
  // 'user' | 'admin'. Validated at the route layer (plain text, not a pg enum,
  // to avoid enum-alteration migrations if roles grow).
  role: text('role').notNull().default('user'),
  // bcrypt hash; set only for accounts with password login enabled.
  passwordHash: text('password_hash'),
  customInstructions: text('custom_instructions'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
})

// Small key/value store for runtime-editable settings (admin panel). Values
// are jsonb so each key defines its own shape (e.g. google_allowed_domains
// holds an array of domain strings).
export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// One row per conversation, for both web and Slack. The database is the source
// of truth for conversation continuity: agent context survives server restarts
// and the in-memory TTL is gone. Rows are purged 14 days after their last use
// (updated_at), see conversation-store.cleanupExpired().
export const conversations = pgTable(
  'conversations',
  {
    // For web this matches the sessionId the client already manages (a UUID).
    id: uuid('id').primaryKey(),
    source: text('source').notNull(), // 'web' | 'slack'
    userId: integer('user_id').references(() => users.id),
    // Slack-only: identifies the thread the conversation belongs to.
    slackChannelId: text('slack_channel_id'),
    slackThreadTs: text('slack_thread_ts'),
    // The app-managed lastResponseId we chain into the next turn via
    // previousResponseId. Not part of the SDK Session interface.
    openaiLastResponseId: text('openai_last_response_id'),
    // Web: a short title derived from the first user message.
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('conversations_slack_thread_idx').on(table.slackChannelId, table.slackThreadTs)]
)

// The agent's context, read and written by PostgresSession. Mutable: the
// compaction session clears and rewrites these rows with summarized history,
// so they are NOT a faithful transcript (the UI uses conversation_messages).
export const conversationItems = pgTable(
  'conversation_items',
  {
    id: serial('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    item: jsonb('item').notNull(), // an AgentInputItem
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('conversation_items_conversation_seq_idx').on(table.conversationId, table.seq)]
)

// Immutable, append-only record used to rehydrate the web UI sidebar. Slack
// does not use it (Slack's own UI keeps the messages). parts has the same shape
// useChat.js builds in the browser: text / tool_call / error.
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
  table => [index('conversation_messages_conversation_idx').on(table.conversationId, table.createdAt)]
)
