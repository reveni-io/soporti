import { randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { getDb } from './index.js'
import { newShareId } from './share-id.js'
import { artifacts, artifactShares, artifactVersions, conversations } from './schema.js'
import { ownedWebConversations } from './conversations.js'
import { SHARE_TTL_MS } from '../constants.js'

const savedColumns = {
  id: artifacts.id,
  identifier: artifacts.identifier,
  title: artifacts.title,
  latestVersion: artifacts.latestVersion,
}

const readColumns = {
  id: artifacts.id,
  title: artifacts.title,
  latestVersion: artifacts.latestVersion,
}

function ownedArtifactIds(userId) {
  return getDb()
    .select({ id: artifacts.id })
    .from(artifacts)
    .innerJoin(conversations, eq(conversations.id, artifacts.conversationId))
    .where(ownedWebConversations(userId))
}

export async function saveArtifactVersion(conversationId, { identifier, title, html }) {
  return getDb().transaction(async tx => {
    const [artifact] = await tx
      .insert(artifacts)
      .values({ id: randomUUID(), conversationId, identifier, title })
      .onConflictDoUpdate({
        target: [artifacts.conversationId, artifacts.identifier],
        set: { title, latestVersion: sql`${artifacts.latestVersion} + 1`, updatedAt: new Date() },
      })
      .returning(savedColumns)

    await tx.insert(artifactVersions).values({ artifactId: artifact.id, version: artifact.latestVersion, html })

    return { id: artifact.id, identifier: artifact.identifier, title: artifact.title, version: artifact.latestVersion }
  })
}

export async function getArtifact(id, userId) {
  const [row] = await getDb()
    .select(readColumns)
    .from(artifacts)
    .innerJoin(conversations, eq(conversations.id, artifacts.conversationId))
    .where(and(eq(artifacts.id, id), ownedWebConversations(userId)))
    .limit(1)
  return row ?? null
}

export async function getArtifactVersions(id) {
  return getDb()
    .select({ version: artifactVersions.version })
    .from(artifactVersions)
    .where(eq(artifactVersions.artifactId, id))
    .orderBy(asc(artifactVersions.version))
}

function versionScope(id, version) {
  return and(eq(artifactVersions.artifactId, id), version === null ? undefined : eq(artifactVersions.version, version))
}

export async function getArtifactHtml(id, version) {
  const [row] = await getDb()
    .select({ version: artifactVersions.version, html: artifactVersions.html })
    .from(artifactVersions)
    .where(versionScope(id, version))
    .orderBy(desc(artifactVersions.version))
    .limit(1)
  return row ?? null
}

export async function findArtifactVersion(id, version) {
  const [row] = await getDb()
    .select({ version: artifactVersions.version })
    .from(artifactVersions)
    .where(versionScope(id, version))
    .orderBy(desc(artifactVersions.version))
    .limit(1)
  return row?.version ?? null
}

export async function listArtifacts(userId) {
  return getDb()
    .select({ ...readColumns, updatedAt: artifacts.updatedAt, versionCount: count(artifactVersions.version) })
    .from(artifacts)
    .innerJoin(conversations, eq(conversations.id, artifacts.conversationId))
    .innerJoin(artifactVersions, eq(artifactVersions.artifactId, artifacts.id))
    .where(ownedWebConversations(userId))
    .groupBy(artifacts.id)
    .orderBy(desc(artifacts.updatedAt))
}

export async function deleteArtifact(id, userId) {
  const [deleted] = await getDb()
    .delete(artifacts)
    .where(and(eq(artifacts.id, id), inArray(artifacts.id, ownedArtifactIds(userId))))
    .returning({ id: artifacts.id })
  return Boolean(deleted)
}

export const VERSION_NOT_FOUND = 'version_not_found'
export const ONLY_VERSION = 'only_version'

export async function deleteArtifactVersion(id, version) {
  return getDb().transaction(async tx => {
    const rows = await tx
      .select({ version: artifactVersions.version })
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, id))

    const remaining = rows.map(row => row.version).filter(stored => stored !== version)

    if (remaining.length === rows.length) return { deleted: false, reason: VERSION_NOT_FOUND }
    if (remaining.length === 0) return { deleted: false, reason: ONLY_VERSION }

    await tx.delete(artifactShares).where(and(eq(artifactShares.artifactId, id), eq(artifactShares.version, version)))
    await tx
      .delete(artifactVersions)
      .where(and(eq(artifactVersions.artifactId, id), eq(artifactVersions.version, version)))

    return { deleted: true, latestVersion: Math.max(...remaining) }
  })
}

export async function createOrRefreshArtifactShare(id, version) {
  const expiresAt = new Date(Date.now() + SHARE_TTL_MS)

  const [share] = await getDb()
    .insert(artifactShares)
    .values({ id: newShareId(), artifactId: id, version, expiresAt })
    .onConflictDoUpdate({ target: [artifactShares.artifactId, artifactShares.version], set: { expiresAt } })
    .returning({ id: artifactShares.id })
  return share.id
}

export async function getSharedArtifact(shareId) {
  const [row] = await getDb()
    .select({
      title: artifacts.title,
      version: artifactShares.version,
      html: artifactVersions.html,
    })
    .from(artifactShares)
    .innerJoin(artifacts, eq(artifacts.id, artifactShares.artifactId))
    .innerJoin(
      artifactVersions,
      and(eq(artifactVersions.artifactId, artifacts.id), eq(artifactVersions.version, artifactShares.version))
    )
    .where(and(eq(artifactShares.id, shareId), gt(artifactShares.expiresAt, new Date())))
    .limit(1)
  return row ?? null
}
