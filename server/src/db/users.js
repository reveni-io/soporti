import { eq, count } from 'drizzle-orm'
import { getDb } from './index.js'
import { users } from './schema.js'

const userColumns = {
  id: users.id,
  googleId: users.googleId,
  email: users.email,
  name: users.name,
  picture: users.picture,
  role: users.role,
}

function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

export async function upsertGoogleUser({ googleId, email, name, picture }, retry = true) {
  const db = getDb()
  const normalizedEmail = normalizeEmail(email)

  const [byGoogle] = await db.select(userColumns).from(users).where(eq(users.googleId, googleId)).limit(1)
  if (byGoogle) {
    const [user] = await db
      .update(users)
      .set({ email: normalizedEmail, name, picture, lastLoginAt: new Date() })
      .where(eq(users.id, byGoogle.id))
      .returning(userColumns)
    return user
  }

  const [byEmail] = await db.select(userColumns).from(users).where(eq(users.email, normalizedEmail)).limit(1)
  if (byEmail) {
    const [user] = await db
      .update(users)
      .set({
        googleId,
        name: name ?? byEmail.name,
        picture: picture ?? byEmail.picture,
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, byEmail.id))
      .returning(userColumns)
    return user
  }

  try {
    const [user] = await db
      .insert(users)
      .values({ googleId, email: normalizedEmail, name, picture })
      .returning(userColumns)
    return user
  } catch (err) {
    if (err.code === '23505' && retry) {
      return upsertGoogleUser({ googleId, email, name, picture }, false)
    }
    throw err
  }
}

export async function upsertSlackUser({ slackId, name }) {
  const conflictSet = { lastLoginAt: new Date() }
  if (name) conflictSet.name = name
  const [user] = await getDb()
    .insert(users)
    .values({ slackId, name: name ?? null })
    .onConflictDoUpdate({
      target: users.slackId,
      set: conflictSet,
    })
    .returning({
      id: users.id,
      slackId: users.slackId,
      name: users.name,
    })
  return user
}

export async function findUserByEmail(email) {
  const [user] = await getDb()
    .select({ ...userColumns, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1)
  return user ?? null
}

export async function findUserById(id) {
  const [user] = await getDb().select(userColumns).from(users).where(eq(users.id, id)).limit(1)
  return user ?? null
}

export async function createUserWithPassword({ email, name, role, passwordHash }) {
  const [user] = await getDb()
    .insert(users)
    .values({ email: normalizeEmail(email), name: name ?? null, role: role ?? 'user', passwordHash })
    .returning(userColumns)
  return user
}

export async function countAdmins() {
  const [row] = await getDb().select({ value: count() }).from(users).where(eq(users.role, 'admin'))
  return row?.value ?? 0
}

export async function listUsers() {
  const rows = await getDb()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      googleId: users.googleId,
      slackId: users.slackId,
      passwordHash: users.passwordHash,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(users.id)
  return rows.map(({ googleId, slackId, passwordHash, ...user }) => ({
    ...user,
    slackId,
    hasGoogle: Boolean(googleId),
    hasSlack: Boolean(slackId),
    hasPassword: Boolean(passwordHash),
  }))
}

export async function touchLastLogin(id) {
  await getDb().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id))
}

export async function setAdminCredentials({ email, name, passwordHash }) {
  const db = getDb()
  const normalizedEmail = normalizeEmail(email)
  const [existing] = await db.select(userColumns).from(users).where(eq(users.email, normalizedEmail)).limit(1)
  if (existing) {
    const [user] = await db
      .update(users)
      .set({ role: 'admin', passwordHash, name: name ?? existing.name })
      .where(eq(users.id, existing.id))
      .returning(userColumns)
    return user
  }
  const [user] = await db
    .insert(users)
    .values({ email: normalizedEmail, name: name ?? null, role: 'admin', passwordHash })
    .returning(userColumns)
  return user
}

export async function getCustomInstructions(userId) {
  const [row] = await getDb()
    .select({ customInstructions: users.customInstructions })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return row?.customInstructions ?? null
}

export async function updateCustomInstructions(userId, instructions) {
  const value = instructions && instructions.trim().length > 0 ? instructions : null
  const [row] = await getDb()
    .update(users)
    .set({ customInstructions: value })
    .where(eq(users.id, userId))
    .returning({ customInstructions: users.customInstructions })
  return row?.customInstructions ?? null
}
