import { Router } from 'express'
import { AWS_REQUEST_FAILED, testConnection } from '../aws/client.js'
import {
  getAwsAccessKey,
  getAwsAccounts,
  getAwsEnabled,
  getAwsRegion,
  getAwsRoleArn,
  parseAwsAccessKey,
  parseAwsAccounts,
  parseAwsRegion,
  parseAwsRoleArn,
  setAwsAccessKey,
  setAwsAccounts,
  setAwsEnabled,
  setAwsRegion,
  setAwsRoleArn,
} from '../aws/settings.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const [enabled, region, accessKey, roleArn, accounts] = await Promise.all([
      getAwsEnabled(),
      getAwsRegion(),
      getAwsAccessKey(),
      getAwsRoleArn(),
      getAwsAccounts(),
    ])
    res.json({
      enabled,
      region: region ?? '',
      accessKeyConfigured: Boolean(accessKey),
      roleArn: roleArn ?? '',
      accounts,
    })
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

router.put('/role-arn', async (req, res) => {
  const { error, value } = parseAwsRoleArn(req.body?.roleArn)
  if (error) return res.status(400).json({ error })

  try {
    await setAwsRoleArn(value)
    res.json({ roleArn: value })
  } catch (err) {
    console.error('Failed to save the AWS role:', err)
    res.status(500).json({ error: 'Failed to save the AWS role.' })
  }
})

router.put('/accounts', async (req, res) => {
  const { error, value } = parseAwsAccounts(req.body?.accounts)
  if (error) return res.status(400).json({ error })

  try {
    await setAwsAccounts(value)
    res.json({ accounts: value })
  } catch (err) {
    console.error('Failed to save the AWS accounts:', err)
    res.status(500).json({ error: 'Failed to save the AWS accounts.' })
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
