import { eq, count } from 'drizzle-orm'
import { getDb } from './index.js'
import { users } from './schema.js'

// Columns safe to return to callers (never the password hash).
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

// Google login upsert, unified by email: one row per person. A row created by
// an admin with a password gets its googleId linked on the first Google login
// with the same email, so a person may have both passwordHash and googleId.
// Slack identities have no email and stay as separate rows. role is never
// touched here — only admins change roles.
export async function upsertGoogleUser({ googleId, email, name, picture }, retry = true) {
  const db = getDb()
  const normalizedEmail = normalizeEmail(email)

  // 1. Known Google identity: refresh the profile.
  const [byGoogle] = await db.select(userColumns).from(users).where(eq(users.googleId, googleId)).limit(1)
  if (byGoogle) {
    const [user] = await db
      .update(users)
      .set({ email: normalizedEmail, name, picture, lastLoginAt: new Date() })
      .where(eq(users.id, byGoogle.id))
      .returning(userColumns)
    return user
  }

  // 2. Same email exists (e.g. an admin-created password user): link the
  // Google identity to that row. Keep existing name/picture unless Google
  // provides one.
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

  // 3. New person: insert. On a unique violation (two concurrent first
  // logins), retry once — the row now exists and lands in branch 1 or 2.
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

// Inserts the Slack user on first interaction, or refreshes last_login_at on
// subsequent ones. Slack identities are kept as separate rows from Google
// ones — same human may have two rows (one per provider). Name is only
// overwritten when a non-empty value is provided (events don't carry it;
// slash commands do).
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

// Includes passwordHash — for the login route only, never expose it further.
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

// For the admin panel. hasPassword/hasGoogle/hasSlack are derived so the
// password hash never leaves the DB layer.
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
    // Slack identities carry no email and often no name; keep the slackId so the
    // admin panel can fall back to it as a display label.
    slackId,
    hasGoogle: Boolean(googleId),
    hasSlack: Boolean(slackId),
    hasPassword: Boolean(passwordHash),
  }))
}

export async function touchLastLogin(id) {
  await getDb().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id))
}

// First-run bootstrap helper. If the email already exists (e.g. the operator
// signed in with Google before creating the admin account), the existing row
// is promoted to admin and given the password; otherwise a new row is created.
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
