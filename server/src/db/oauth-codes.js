import { and, eq, gt, isNull } from 'drizzle-orm'
import { getDb } from './index.js'
import { oauthCodes } from './schema.js'

export async function createAuthorizationCode({
  codeHash,
  clientId,
  userId,
  redirectUri,
  codeChallenge,
  scope,
  resource,
  expiresAt,
}) {
  const [row] = await getDb()
    .insert(oauthCodes)
    .values({ codeHash, clientId, userId, redirectUri, codeChallenge, scope, resource, expiresAt })
    .returning({ id: oauthCodes.id })
  return row
}

export async function consumeAuthorizationCode(codeHash) {
  const [row] = await getDb()
    .update(oauthCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(oauthCodes.codeHash, codeHash), isNull(oauthCodes.usedAt), gt(oauthCodes.expiresAt, new Date())))
    .returning({
      clientId: oauthCodes.clientId,
      userId: oauthCodes.userId,
      redirectUri: oauthCodes.redirectUri,
      codeChallenge: oauthCodes.codeChallenge,
      scope: oauthCodes.scope,
      resource: oauthCodes.resource,
    })
  return row ?? null
}
