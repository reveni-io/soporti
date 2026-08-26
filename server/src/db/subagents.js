import { asc, eq } from 'drizzle-orm'
import { getDb } from './index.js'
import { subagents } from './schema.js'

const subagentColumns = {
  id: subagents.id,
  name: subagents.name,
  description: subagents.description,
  instructions: subagents.instructions,
  provider: subagents.provider,
  model: subagents.model,
  tools: subagents.tools,
  exclusive: subagents.exclusive,
  enabled: subagents.enabled,
}

export async function listSubagents() {
  return getDb().select(subagentColumns).from(subagents).orderBy(asc(subagents.name))
}

export async function listEnabledSubagents() {
  return getDb().select(subagentColumns).from(subagents).where(eq(subagents.enabled, true)).orderBy(asc(subagents.name))
}

export async function getSubagentById(id) {
  const [row] = await getDb().select(subagentColumns).from(subagents).where(eq(subagents.id, id)).limit(1)
  return row ?? null
}

export async function createSubagent({ name, description, instructions, provider, model, tools, exclusive, enabled }) {
  const [row] = await getDb()
    .insert(subagents)
    .values({
      name,
      description,
      instructions,
      provider: provider ?? null,
      model: model ?? null,
      tools,
      exclusive,
      enabled,
    })
    .returning(subagentColumns)
  return row
}

export async function updateSubagent(
  id,
  { name, description, instructions, provider, model, tools, exclusive, enabled }
) {
  const [row] = await getDb()
    .update(subagents)
    .set({
      name,
      description,
      instructions,
      provider: provider ?? null,
      model: model ?? null,
      tools,
      exclusive,
      enabled,
      updatedAt: new Date(),
    })
    .where(eq(subagents.id, id))
    .returning(subagentColumns)
  return row ?? null
}

export async function deleteSubagent(id) {
  const [row] = await getDb().delete(subagents).where(eq(subagents.id, id)).returning({ id: subagents.id })
  return Boolean(row)
}
