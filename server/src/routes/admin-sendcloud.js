import { Router } from 'express'
import {
  DUPLICATE_SENDCLOUD_ACCOUNT,
  DUPLICATE_SENDCLOUD_ACCOUNT_MESSAGE,
  addSendcloudAccount,
  describeSendcloudAccount,
  getSendcloudAccounts,
  parseSendcloudAccount,
  removeSendcloudAccount,
} from '../sendcloud/settings.js'

const ID_RE = /^\d{1,9}$/
const UNIQUE_VIOLATION = '23505'
const DUPLICATE_CODES = new Set([DUPLICATE_SENDCLOUD_ACCOUNT, UNIQUE_VIOLATION])

const router = Router()

function errorCode(err) {
  return err.cause?.code ?? err.code
}

function describeInsertFailure(err) {
  return err.cause?.message ?? err.name
}

router.get('/', async (_req, res) => {
  try {
    const accounts = await getSendcloudAccounts()
    res.json({ accounts: accounts.map(describeSendcloudAccount) })
  } catch (err) {
    console.error('Failed to load the Sendcloud accounts:', err)
    res.status(500).json({ error: 'Failed to load the Sendcloud accounts.' })
  }
})

router.post('/accounts', async (req, res) => {
  const { error, value } = parseSendcloudAccount(req.body ?? {})
  if (error) return res.status(400).json({ error })

  try {
    const account = await addSendcloudAccount(value)
    res.status(201).json({ account: describeSendcloudAccount(account) })
  } catch (err) {
    if (DUPLICATE_CODES.has(errorCode(err))) return res.status(409).json({ error: DUPLICATE_SENDCLOUD_ACCOUNT_MESSAGE })

    console.error('Failed to link the Sendcloud account:', describeInsertFailure(err))
    res.status(500).json({ error: 'Failed to link the Sendcloud account.' })
  }
})

router.delete('/accounts/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid Sendcloud account ID.' })

  try {
    const removed = await removeSendcloudAccount(Number(req.params.id))
    if (!removed) return res.status(404).json({ error: 'Sendcloud account not found.' })

    res.json({ deleted: true })
  } catch (err) {
    console.error('Failed to remove the Sendcloud account:', err)
    res.status(500).json({ error: 'Failed to remove the Sendcloud account.' })
  }
})

export default router
