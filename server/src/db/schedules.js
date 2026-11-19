import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm'
import { SCHEDULE_ONCE } from '../constants.js'
import { getDb } from './index.js'
import { schedules } from './schema.js'

const scheduleColumns = {
  id: schedules.id,
  question: schedules.question,
  sources: schedules.sources,
  profile: schedules.profile,
  frequency: schedules.frequency,
  minute: schedules.minute,
  hour: schedules.hour,
  weekday: schedules.weekday,
  monthDay: schedules.monthDay,
  timezone: schedules.timezone,
  nextRunAt: schedules.nextRunAt,
  lastRunAt: schedules.lastRunAt,
  lastStatus: schedules.lastStatus,
  lastError: schedules.lastError,
  legal: schedules.legal,
}

const runnableColumns = {
  ...scheduleColumns,
  userId: schedules.userId,
  botId: schedules.botId,
  title: schedules.title,
  runDate: schedules.runDate,
  lastResult: schedules.lastResult,
}

function ownedSchedule(id, userId) {
  return and(eq(schedules.id, id), eq(schedules.userId, userId), isNull(schedules.botId))
}

function ownedSchedules(userId) {
  return and(eq(schedules.userId, userId), isNull(schedules.botId))
}

export async function listSchedules(userId) {
  return getDb().select(scheduleColumns).from(schedules).where(ownedSchedules(userId)).orderBy(asc(schedules.nextRunAt))
}

export async function countSchedules(userId) {
  const [row] = await getDb()
    .select({ total: sql`count(*)::int` })
    .from(schedules)
    .where(ownedSchedules(userId))
  return row?.total ?? 0
}

export async function createSchedule(userId, schedule) {
  const [row] = await getDb()
    .insert(schedules)
    .values({ ...schedule, userId })
    .returning(scheduleColumns)
  return row
}

export async function updateSchedule(id, userId, schedule) {
  const [row] = await getDb()
    .update(schedules)
    .set({ ...schedule, updatedAt: new Date() })
    .where(ownedSchedule(id, userId))
    .returning(scheduleColumns)
  return row ?? null
}

export async function setScheduleLegal(id, userId, legal) {
  const [row] = await getDb()
    .update(schedules)
    .set({ legal, updatedAt: new Date() })
    .where(ownedSchedule(id, userId))
    .returning(scheduleColumns)
  return row ?? null
}

export async function countLegalSchedules() {
  const [row] = await getDb()
    .select({ total: sql`count(*)::int` })
    .from(schedules)
    .where(and(eq(schedules.legal, true), isNull(schedules.botId)))
  return row?.total ?? 0
}

export async function deleteSchedule(id, userId) {
  const [row] = await getDb().delete(schedules).where(ownedSchedule(id, userId)).returning({ id: schedules.id })
  return Boolean(row)
}

async function advanceClaimedSchedule(tx, schedule, nextRunFor) {
  if (schedule.frequency === SCHEDULE_ONCE) {
    await tx.delete(schedules).where(eq(schedules.id, schedule.id))
    return
  }

  await tx
    .update(schedules)
    .set({ nextRunAt: nextRunFor(schedule), lastRunAt: new Date(), updatedAt: new Date() })
    .where(eq(schedules.id, schedule.id))
}

export async function claimDueSchedules(limit, nextRunFor) {
  return getDb().transaction(async tx => {
    const due = await tx
      .select(runnableColumns)
      .from(schedules)
      .where(and(lte(schedules.nextRunAt, new Date()), eq(schedules.paused, false)))
      .orderBy(asc(schedules.nextRunAt))
      .limit(limit)
      .for('update', { skipLocked: true })

    for (const schedule of due) {
      await advanceClaimedSchedule(tx, schedule, nextRunFor)
    }

    return due
  })
}

export async function markScheduleRun(id, { status, error = null }) {
  await getDb()
    .update(schedules)
    .set({ lastStatus: status, lastError: error, updatedAt: new Date() })
    .where(eq(schedules.id, id))
}
