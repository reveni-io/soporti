import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from './index.js'
import { oauthRefreshTokens } from './schema.js'

export async function createRefreshToken({ tokenHash, clientId, userId, scope, rotatedFromId, expiresAt }) {
  const [row] = await getDb()
    .insert(oauthRefreshTokens)
    .values({ tokenHash, clientId, userId, scope, rotatedFromId: rotatedFromId ?? null, expiresAt })
    .returning({ id: oauthRefreshTokens.id })
  return row
}

export async function findRefreshTokenByHash(tokenHash) {
  const [row] = await getDb()
    .select({
      id: oauthRefreshTokens.id,
      clientId: oauthRefreshTokens.clientId,
      userId: oauthRefreshTokens.userId,
      scope: oauthRefreshTokens.scope,
      revokedAt: oauthRefreshTokens.revokedAt,
      expiresAt: oauthRefreshTokens.expiresAt,
    })
    .from(oauthRefreshTokens)
    .where(eq(oauthRefreshTokens.tokenHash, tokenHash))
    .limit(1)
  return row ?? null
}

export async function revokeRefreshToken(id) {
  const [row] = await getDb()
    .update(oauthRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthRefreshTokens.id, id), isNull(oauthRefreshTokens.revokedAt)))
    .returning({ id: oauthRefreshTokens.id })
  return Boolean(row)
}

export async function revokeRefreshTokensForGrant(userId, clientId) {
  await getDb()
    .update(oauthRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(oauthRefreshTokens.userId, userId),
        eq(oauthRefreshTokens.clientId, clientId),
        isNull(oauthRefreshTokens.revokedAt)
      )
    )
}
