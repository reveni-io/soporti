import { and, asc, eq, lte, sql } from 'drizzle-orm'
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
}

const runnableColumns = { ...scheduleColumns, userId: schedules.userId }

export async function listSchedules(userId) {
  return getDb()
    .select(scheduleColumns)
    .from(schedules)
    .where(eq(schedules.userId, userId))
    .orderBy(asc(schedules.nextRunAt))
}

export async function countSchedules(userId) {
  const [row] = await getDb()
    .select({ total: sql`count(*)::int` })
    .from(schedules)
    .where(eq(schedules.userId, userId))
  return row?.total ?? 0
}

export async function createSchedule(userId, schedule) {
  const [row] = await getDb()
    .insert(schedules)
    .values({ ...schedule, userId })
    .returning(scheduleColumns)
  return row
}

export async function deleteSchedule(id, userId) {
  const [row] = await getDb()
    .delete(schedules)
    .where(and(eq(schedules.id, id), eq(schedules.userId, userId)))
    .returning({ id: schedules.id })
  return Boolean(row)
}

export async function claimDueSchedules(limit, nextRunFor) {
  return getDb().transaction(async tx => {
    const due = await tx
      .select(runnableColumns)
      .from(schedules)
      .where(lte(schedules.nextRunAt, new Date()))
      .orderBy(asc(schedules.nextRunAt))
      .limit(limit)
      .for('update', { skipLocked: true })

    for (const schedule of due) {
      await tx
        .update(schedules)
        .set({ nextRunAt: nextRunFor(schedule), lastRunAt: new Date(), updatedAt: new Date() })
        .where(eq(schedules.id, schedule.id))
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
