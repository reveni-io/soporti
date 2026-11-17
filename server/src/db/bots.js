import { and, asc, eq, sql } from 'drizzle-orm'
import { getDb } from './index.js'
import { bots } from './schema.js'

const botColumns = {
  id: bots.id,
  name: bots.name,
  description: bots.description,
  profile: bots.profile,
  avatarSeed: bots.avatarSeed,
  unreadCount: bots.unreadCount,
  createdAt: bots.createdAt,
}

function ownedBot(id, userId) {
  return and(eq(bots.id, id), eq(bots.userId, userId))
}

export async function listBots(userId) {
  return getDb().select(botColumns).from(bots).where(eq(bots.userId, userId)).orderBy(asc(bots.createdAt), asc(bots.id))
}

export async function countBots(userId) {
  const [row] = await getDb()
    .select({ total: sql`count(*)::int` })
    .from(bots)
    .where(eq(bots.userId, userId))
  return row?.total ?? 0
}

export async function getBot(id, userId) {
  const [row] = await getDb().select(botColumns).from(bots).where(ownedBot(id, userId)).limit(1)
  return row ?? null
}

export async function createBot(userId, { name, description, profile, avatarSeed }) {
  const [row] = await getDb()
    .insert(bots)
    .values({ userId, name, description, profile, avatarSeed })
    .returning(botColumns)
  return row
}

export async function updateBot(id, userId, { name, description, profile, avatarSeed }) {
  const changes = { name, description, profile, updatedAt: new Date() }
  if (avatarSeed) changes.avatarSeed = avatarSeed

  const [row] = await getDb().update(bots).set(changes).where(ownedBot(id, userId)).returning(botColumns)
  return row ?? null
}

export async function deleteBot(id, userId) {
  const [row] = await getDb().delete(bots).where(ownedBot(id, userId)).returning({ id: bots.id })
  return Boolean(row)
}

export async function markBotRead(id, userId) {
  const [row] = await getDb()
    .update(bots)
    .set({ unreadCount: 0 })
    .where(ownedBot(id, userId))
    .returning({ id: bots.id })
  return Boolean(row)
}

export async function incrementBotUnread(id) {
  await getDb()
    .update(bots)
    .set({ unreadCount: sql`${bots.unreadCount} + 1` })
    .where(eq(bots.id, id))
}
