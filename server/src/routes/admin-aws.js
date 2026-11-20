import { Router } from 'express'
import { AWS_REQUEST_FAILED, testConnection } from '../aws/client.js'
import {
  getAwsAccessKey,
  getAwsEnabled,
  getAwsRegion,
  parseAwsAccessKey,
  parseAwsRegion,
  setAwsAccessKey,
  setAwsEnabled,
  setAwsRegion,
} from '../aws/settings.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const [enabled, region, accessKey] = await Promise.all([getAwsEnabled(), getAwsRegion(), getAwsAccessKey()])
    res.json({ enabled, region: region ?? '', accessKeyConfigured: Boolean(accessKey) })
  } catch (err) {
    console.error('Failed to load the AWS settings:', err)
    res.status(500).json({ error: 'Failed to load the AWS settings.' })
  }
})

router.put('/enabled', async (req, res) => {
  const { enabled } = req.body ?? {}
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: '"enabled" must be a boolean.' })

  try {
    await setAwsEnabled(enabled)
    res.json({ enabled })
  } catch (err) {
    console.error('Failed to save the AWS switch:', err)
    res.status(500).json({ error: 'Failed to save the AWS switch.' })
  }
})

router.put('/region', async (req, res) => {
  const { error, value } = parseAwsRegion(req.body?.region)
  if (error) return res.status(400).json({ error })

  try {
    await setAwsRegion(value)
    res.json({ region: value })
  } catch (err) {
    console.error('Failed to save the AWS region:', err)
    res.status(500).json({ error: 'Failed to save the AWS region.' })
  }
})

router.put('/access-key', async (req, res) => {
  const { error, value } = parseAwsAccessKey(req.body)
  if (error) return res.status(400).json({ error })

  try {
    await setAwsAccessKey(value)
    res.json({ accessKeyConfigured: value.accessKeyId.length > 0 })
  } catch (err) {
    console.error('Failed to save the AWS access key:', err.name)
    res.status(500).json({ error: 'Failed to save the AWS access key.' })
  }
})

router.post('/test', async (_req, res) => {
  try {
    res.json(await testConnection())
  } catch (err) {
    if (err.code === AWS_REQUEST_FAILED) return res.status(422).json({ error: err.message })

    console.error('Failed to test the AWS connection:', err)
    res.status(500).json({ error: 'Failed to test the AWS connection.' })
  }
})

export default router
