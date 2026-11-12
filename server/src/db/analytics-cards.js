import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import { getDb } from './index.js'
import { inAccessibleDashboard } from './analytics-dashboards.js'
import { analyticsCards } from './schema.js'
import { ANALYTICS_STATUS_FAILED, ANALYTICS_STATUS_GENERATING, ANALYTICS_STATUS_READY } from '../constants.js'

const INITIAL_STEP = 'Starting'

const cardColumns = {
  id: analyticsCards.id,
  title: analyticsCards.title,
  prompt: analyticsCards.prompt,
  sql: analyticsCards.sql,
  chart: analyticsCards.chart,
  layout: analyticsCards.layout,
  status: analyticsCards.status,
  step: analyticsCards.step,
  error: analyticsCards.error,
  createdAt: analyticsCards.createdAt,
  updatedAt: analyticsCards.updatedAt,
}

function accessibleCard(id, userId) {
  return and(eq(analyticsCards.id, id), inAccessibleDashboard(analyticsCards.dashboardId, userId))
}

function dashboardCards(dashboardId, userId) {
  return and(eq(analyticsCards.dashboardId, dashboardId), inAccessibleDashboard(analyticsCards.dashboardId, userId))
}

async function updateGeneratingCard(id, changes) {
  const [updated] = await getDb()
    .update(analyticsCards)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(analyticsCards.id, id), eq(analyticsCards.status, ANALYTICS_STATUS_GENERATING)))
    .returning({ id: analyticsCards.id })

  return Boolean(updated)
}

export async function listCards(dashboardId, userId) {
  return getDb()
    .select(cardColumns)
    .from(analyticsCards)
    .where(dashboardCards(dashboardId, userId))
    .orderBy(asc(analyticsCards.createdAt), asc(analyticsCards.id))
}

export async function listCardLayouts(dashboardId, userId) {
  const rows = await getDb()
    .select({ layout: analyticsCards.layout })
    .from(analyticsCards)
    .where(dashboardCards(dashboardId, userId))

  return rows.map(row => row.layout)
}

export async function countCards(dashboardId, userId) {
  const [row] = await getDb()
    .select({
      total: sql`count(*)::int`,
      generating: sql`(count(*) filter (where ${analyticsCards.status} = ${ANALYTICS_STATUS_GENERATING}))::int`,
    })
    .from(analyticsCards)
    .where(dashboardCards(dashboardId, userId))

  return { total: row?.total ?? 0, generating: row?.generating ?? 0 }
}

export async function getCard(id, userId) {
  const [card] = await getDb().select(cardColumns).from(analyticsCards).where(accessibleCard(id, userId)).limit(1)

  return card ?? null
}

export async function getCardDashboardId(id, userId) {
  const [card] = await getDb()
    .select({ dashboardId: analyticsCards.dashboardId })
    .from(analyticsCards)
    .where(accessibleCard(id, userId))
    .limit(1)

  return card?.dashboardId ?? null
}

export async function createCard(dashboardId, { title, prompt, layout }) {
  const [card] = await getDb()
    .insert(analyticsCards)
    .values({
      id: randomUUID(),
      dashboardId,
      title,
      prompt,
      layout,
      status: ANALYTICS_STATUS_GENERATING,
      step: INITIAL_STEP,
    })
    .returning(cardColumns)

  return card
}

export async function claimCard(id, userId, { from, prompt = null }) {
  const changes = { status: ANALYTICS_STATUS_GENERATING, step: INITIAL_STEP, error: null, updatedAt: new Date() }
  if (prompt) changes.prompt = prompt

  const [card] = await getDb()
    .update(analyticsCards)
    .set(changes)
    .where(and(accessibleCard(id, userId), inArray(analyticsCards.status, from)))
    .returning(cardColumns)

  return card ?? null
}

export async function saveGeneratedChart(id, { title, sql: query, chart }) {
  return updateGeneratingCard(id, {
    title,
    sql: query,
    chart,
    status: ANALYTICS_STATUS_READY,
    step: null,
    error: null,
  })
}

export async function failCard(id, error) {
  return updateGeneratingCard(id, { status: ANALYTICS_STATUS_FAILED, step: null, error })
}

export async function setCardStep(id, step) {
  return updateGeneratingCard(id, { step })
}

function editedState(changes) {
  if (changes.sql) return { status: ANALYTICS_STATUS_READY, error: null }

  return {
    status: sql`case when ${analyticsCards.sql} is null then ${analyticsCards.status} else ${ANALYTICS_STATUS_READY} end`,
    error: sql`case when ${analyticsCards.sql} is null then ${analyticsCards.error} else null end`,
  }
}

export async function updateCard(id, userId, changes) {
  const [card] = await getDb()
    .update(analyticsCards)
    .set({ ...changes, ...editedState(changes), updatedAt: new Date() })
    .where(and(accessibleCard(id, userId), ne(analyticsCards.status, ANALYTICS_STATUS_GENERATING)))
    .returning(cardColumns)

  return card ?? null
}

export async function saveCardLayouts(dashboardId, userId, items) {
  const inDashboard = dashboardCards(dashboardId, userId)

  await getDb().transaction(async tx => {
    for (const { id, x, y, w, h } of items) {
      await tx
        .update(analyticsCards)
        .set({ layout: { x, y, w, h } })
        .where(and(eq(analyticsCards.id, id), inDashboard))
    }
  })
}

export async function deleteCard(id, userId) {
  const [deleted] = await getDb()
    .delete(analyticsCards)
    .where(accessibleCard(id, userId))
    .returning({ id: analyticsCards.id })

  return Boolean(deleted)
}

export async function failInterruptedCards(error) {
  const failed = await getDb()
    .update(analyticsCards)
    .set({ status: ANALYTICS_STATUS_FAILED, step: null, error, updatedAt: new Date() })
    .where(eq(analyticsCards.status, ANALYTICS_STATUS_GENERATING))
    .returning({ id: analyticsCards.id })

  return failed.length
}
