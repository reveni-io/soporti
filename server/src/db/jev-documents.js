import { and, count, desc, eq, isNotNull } from 'drizzle-orm'
import { getDb } from './index.js'
import { jevDocuments, jevHistory, jevSetVersions } from './schema.js'

const PAGE_SIZE = 5

const documentColumns = {
  id: jevDocuments.id,
  rev: jevDocuments.rev,
  data: jevDocuments.data,
  setVersion: jevDocuments.setVersion,
}

const historyColumns = {
  at: jevHistory.createdAt,
  author: jevHistory.authorEmail,
  change: jevHistory.change,
  rev: jevHistory.rev,
}

const versionColumns = {
  version: jevSetVersions.version,
  at: jevSetVersions.createdAt,
  author: jevSetVersions.authorEmail,
  change: jevSetVersions.change,
  set: jevSetVersions.set,
}

export async function getJevDocument(id) {
  const [row] = await getDb().select(documentColumns).from(jevDocuments).where(eq(jevDocuments.id, id)).limit(1)

  return row ?? null
}

export async function getLatestJevSave(documentId) {
  const [row] = await getDb()
    .select(historyColumns)
    .from(jevHistory)
    .where(and(eq(jevHistory.documentId, documentId), isNotNull(jevHistory.rev)))
    .orderBy(desc(jevHistory.createdAt), desc(jevHistory.id))
    .limit(1)

  return row ?? null
}

async function applySave(tx, current, { data, change, set, author }) {
  const rev = current.rev + 1
  const setVersion = set ? current.setVersion + 1 : current.setVersion

  if (set) {
    await tx
      .insert(jevSetVersions)
      .values({ documentId: current.id, version: setVersion, set, authorEmail: author, change })
  }
  await tx.insert(jevHistory).values({
    documentId: current.id,
    rev,
    authorEmail: author,
    change: set ? `${change} (set v${setVersion})` : change,
  })

  const [row] = await tx
    .update(jevDocuments)
    .set({ rev, data, setVersion, updatedAt: new Date() })
    .where(eq(jevDocuments.id, current.id))
    .returning(documentColumns)

  return row
}

export async function saveJevDocument(id, { expectedRev, author, defaults, plan }) {
  return getDb().transaction(async tx => {
    await tx.insert(jevDocuments).values({ id, rev: 0, data: defaults, setVersion: 0 }).onConflictDoNothing()
    const [current] = await tx.select(documentColumns).from(jevDocuments).where(eq(jevDocuments.id, id)).for('update')

    if (current.rev !== expectedRev) return { conflict: true, document: current }

    const save = plan(current)
    if (!save) return { conflict: false, document: current }
    if (save.error) return { conflict: false, error: save.error, document: current }

    return { conflict: false, document: await applySave(tx, current, { ...save, author }) }
  })
}

export async function addJevHistoryEntry(documentId, { author, change }) {
  await getDb().insert(jevHistory).values({ documentId, rev: null, authorEmail: author, change })
}

async function listPage({ table, columns, where, orderBy, page }) {
  const [entries, [{ total }]] = await Promise.all([
    getDb()
      .select(columns)
      .from(table)
      .where(where)
      .orderBy(...orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    getDb().select({ total: count() }).from(table).where(where),
  ])

  return { entries, total, page, pageSize: PAGE_SIZE }
}

export async function listJevHistory(documentId, page) {
  return listPage({
    table: jevHistory,
    columns: historyColumns,
    where: eq(jevHistory.documentId, documentId),
    orderBy: [desc(jevHistory.createdAt), desc(jevHistory.id)],
    page,
  })
}

export async function listJevSetVersions(documentId, page) {
  return listPage({
    table: jevSetVersions,
    columns: versionColumns,
    where: eq(jevSetVersions.documentId, documentId),
    orderBy: [desc(jevSetVersions.version)],
    page,
  })
}
