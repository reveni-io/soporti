import { and, asc, eq, sql } from 'drizzle-orm'
import { getDb } from './index.js'
import { schedules } from './schema.js'

const routineColumns = {
  id: schedules.id,
  title: schedules.title,
  instruction: schedules.question,
  frequency: schedules.frequency,
  minute: schedules.minute,
  hour: schedules.hour,
  weekday: schedules.weekday,
  monthDay: schedules.monthDay,
  runDate: schedules.runDate,
  timezone: schedules.timezone,
  paused: schedules.paused,
  nextRunAt: schedules.nextRunAt,
  lastRunAt: schedules.lastRunAt,
  lastStatus: schedules.lastStatus,
}

function ownedRoutines({ botId, userId }) {
  return and(eq(schedules.botId, botId), eq(schedules.userId, userId))
}

function ownedRoutine(id, scope) {
  return and(eq(schedules.id, id), ownedRoutines(scope))
}

function toScheduleValues({ instruction, ...routine }) {
  return { ...routine, question: instruction }
}

export async function listRoutines(scope) {
  return getDb()
    .select(routineColumns)
    .from(schedules)
    .where(ownedRoutines(scope))
    .orderBy(asc(schedules.nextRunAt), asc(schedules.id))
}

export async function countRoutines(scope) {
  const [row] = await getDb()
    .select({ total: sql`count(*)::int` })
    .from(schedules)
    .where(ownedRoutines(scope))
  return row?.total ?? 0
}

export async function getRoutine(id, scope) {
  const [row] = await getDb().select(routineColumns).from(schedules).where(ownedRoutine(id, scope)).limit(1)
  return row ?? null
}

export async function createRoutine(scope, routine) {
  const [row] = await getDb()
    .insert(schedules)
    .values({ ...toScheduleValues(routine), botId: scope.botId, userId: scope.userId })
    .returning(routineColumns)
  return row
}

export async function updateRoutine(id, scope, routine) {
  const [row] = await getDb()
    .update(schedules)
    .set({ ...toScheduleValues(routine), updatedAt: new Date() })
    .where(ownedRoutine(id, scope))
    .returning(routineColumns)
  return row ?? null
}

export async function setRoutinePaused(id, scope, { paused, nextRunAt }) {
  const [row] = await getDb()
    .update(schedules)
    .set({ paused, nextRunAt, updatedAt: new Date() })
    .where(ownedRoutine(id, scope))
    .returning(routineColumns)
  return row ?? null
}

export async function deleteRoutine(id, scope) {
  const [row] = await getDb().delete(schedules).where(ownedRoutine(id, scope)).returning({ id: schedules.id })
  return Boolean(row)
}

export async function storeRoutineResult(id, lastResult) {
  await getDb().update(schedules).set({ lastResult, updatedAt: new Date() }).where(eq(schedules.id, id))
}
