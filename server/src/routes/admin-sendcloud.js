import { Router } from 'express'
import {
  DUPLICATE_SENDCLOUD_ACCOUNT,
  INVALID_SENDCLOUD_ACCOUNT,
  addSendcloudAccount,
  describeSendcloudAccount,
  getSendcloudAccounts,
  removeSendcloudAccount,
} from '../sendcloud/settings.js'

const ID_RE = /^\d{1,9}$/
const UNIQUE_VIOLATION = '23505'
const DUPLICATE_ERROR = 'A Sendcloud account with this name already exists.'

const router = Router()

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
  try {
    const account = await addSendcloudAccount(req.body ?? {})
    res.status(201).json({ account: describeSendcloudAccount(account) })
  } catch (err) {
    if (err.code === INVALID_SENDCLOUD_ACCOUNT) return res.status(400).json({ error: err.message })
    if (err.code === DUPLICATE_SENDCLOUD_ACCOUNT || err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: DUPLICATE_ERROR })
    }

    console.error('Failed to link the Sendcloud account:', err)
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
