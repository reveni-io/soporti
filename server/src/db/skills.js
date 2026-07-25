import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from './index.js'
import { skills } from './schema.js'

const skillColumns = {
  id: skills.id,
  name: skills.name,
  description: skills.description,
  instructions: skills.instructions,
}

export async function listSkills(userId) {
  return getDb().select(skillColumns).from(skills).where(eq(skills.userId, userId)).orderBy(skills.name)
}

export async function getSkillById(id, userId) {
  const [row] = await getDb()
    .select(skillColumns)
    .from(skills)
    .where(and(eq(skills.id, id), eq(skills.userId, userId)))
    .limit(1)
  return row ?? null
}

export async function createSkill(userId, { name, description, instructions }) {
  const [row] = await getDb()
    .insert(skills)
    .values({ userId, name, description: description ?? null, instructions })
    .returning(skillColumns)
  return row
}

export async function updateSkill(id, userId, { name, description, instructions }) {
  const [row] = await getDb()
    .update(skills)
    .set({ name, description: description ?? null, instructions, updatedAt: new Date() })
    .where(and(eq(skills.id, id), eq(skills.userId, userId)))
    .returning(skillColumns)
  return row ?? null
}

export async function deleteSkill(id, userId) {
  const [row] = await getDb()
    .delete(skills)
    .where(and(eq(skills.id, id), eq(skills.userId, userId)))
    .returning({ id: skills.id })
  return Boolean(row)
}

export async function getSkillsByIds(ids, userId) {
  if (!Array.isArray(ids) || ids.length === 0) return []
  return getDb()
    .select(skillColumns)
    .from(skills)
    .where(and(inArray(skills.id, ids), eq(skills.userId, userId)))
}
