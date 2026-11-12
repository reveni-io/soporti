import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, or, sql } from 'drizzle-orm'
import { getDb } from './index.js'
import { analyticsCards, analyticsDashboards, users } from './schema.js'
import { ANALYTICS_STATUS_GENERATING } from '../constants.js'

const FIRST_DASHBOARD_NAME = 'My dashboard'

function accessibleDashboard(userId) {
  return or(eq(analyticsDashboards.userId, userId), eq(analyticsDashboards.shared, true))
}

export function inAccessibleDashboard(dashboardId, userId) {
  return sql`${dashboardId} in (select ${analyticsDashboards.id} from ${analyticsDashboards} where ${accessibleDashboard(userId)})`
}

function ownedDashboard(id, userId) {
  return and(eq(analyticsDashboards.id, id), eq(analyticsDashboards.userId, userId))
}

function isOwner(userId) {
  return sql`${analyticsDashboards.userId} = ${userId}`
}

function dashboardColumns(userId) {
  return {
    id: analyticsDashboards.id,
    name: analyticsDashboards.name,
    shared: analyticsDashboards.shared,
    isOwner: isOwner(userId),
    ownerName: sql`coalesce(nullif(${users.name}, ''), ${users.email}, '')`,
    createdAt: analyticsDashboards.createdAt,
    updatedAt: analyticsDashboards.updatedAt,
  }
}

function selectDashboards(userId) {
  return getDb()
    .select(dashboardColumns(userId))
    .from(analyticsDashboards)
    .innerJoin(users, eq(users.id, analyticsDashboards.userId))
}

export async function listDashboards(userId) {
  return selectDashboards(userId)
    .where(accessibleDashboard(userId))
    .orderBy(
      desc(isOwner(userId)),
      sql`case when ${isOwner(userId)} then ${analyticsDashboards.createdAt} end`,
      asc(sql`lower(${analyticsDashboards.name})`),
      asc(analyticsDashboards.id)
    )
}

export async function getDashboard(id, userId) {
  const [dashboard] = await selectDashboards(userId)
    .where(and(eq(analyticsDashboards.id, id), accessibleDashboard(userId)))
    .limit(1)

  return dashboard ?? null
}

export async function countDashboards(userId) {
  const [row] = await getDb()
    .select({ total: sql`count(*)::int` })
    .from(analyticsDashboards)
    .where(eq(analyticsDashboards.userId, userId))

  return row?.total ?? 0
}

export async function createDashboard(userId, name) {
  const id = randomUUID()
  await getDb().insert(analyticsDashboards).values({ id, userId, name })

  return getDashboard(id, userId)
}

export async function ensureDashboard(userId) {
  await getDb().transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update')

    const [existing] = await tx
      .select({ id: analyticsDashboards.id })
      .from(analyticsDashboards)
      .where(eq(analyticsDashboards.userId, userId))
      .limit(1)
    if (existing) return

    await tx.insert(analyticsDashboards).values({ id: randomUUID(), userId, name: FIRST_DASHBOARD_NAME })
  })
}

export async function updateDashboard(id, userId, changes) {
  const [updated] = await getDb()
    .update(analyticsDashboards)
    .set({ ...changes, updatedAt: new Date() })
    .where(ownedDashboard(id, userId))
    .returning({ id: analyticsDashboards.id })
  if (!updated) return null

  return getDashboard(id, userId)
}

export async function deleteDashboard(id, userId) {
  const generating = await getDb()
    .select({ id: analyticsCards.id })
    .from(analyticsCards)
    .where(and(eq(analyticsCards.dashboardId, id), eq(analyticsCards.status, ANALYTICS_STATUS_GENERATING)))

  const [deleted] = await getDb()
    .delete(analyticsDashboards)
    .where(ownedDashboard(id, userId))
    .returning({ id: analyticsDashboards.id })
  if (!deleted) return null

  return generating.map(card => card.id)
}
