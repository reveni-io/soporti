import { asc, eq } from 'drizzle-orm'
import { getDb } from './index.js'
import { sendcloudAccounts } from './schema.js'

const SUMMARY_COLUMNS = {
  id: sendcloudAccounts.id,
  name: sendcloudAccounts.name,
  createdAt: sendcloudAccounts.createdAt,
}

const CREDENTIAL_COLUMNS = {
  ...SUMMARY_COLUMNS,
  publicKey: sendcloudAccounts.publicKey,
  secretKey: sendcloudAccounts.secretKey,
}

export async function listSendcloudAccounts() {
  return getDb().select(CREDENTIAL_COLUMNS).from(sendcloudAccounts).orderBy(asc(sendcloudAccounts.name))
}

export async function createSendcloudAccount({ name, publicKey, secretKey }) {
  const [row] = await getDb()
    .insert(sendcloudAccounts)
    .values({ name, publicKey, secretKey })
    .returning(SUMMARY_COLUMNS)
  return row
}

export async function deleteSendcloudAccount(id) {
  const [row] = await getDb()
    .delete(sendcloudAccounts)
    .where(eq(sendcloudAccounts.id, id))
    .returning({ id: sendcloudAccounts.id })
  return Boolean(row)
}
