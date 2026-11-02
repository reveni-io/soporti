import { Router } from 'express'
import { HUBSPOT_REQUEST_FAILED, getAccountDetails } from '../hubspot/client.js'
import { describeHubspotAreas, parseHubspotPermissions, requiredScopes } from '../hubspot/permissions.js'
import {
  getHubspotPermissions,
  isHubspotConfigured,
  parseHubspotToken,
  setHubspotPermissions,
  setHubspotToken,
} from '../hubspot/settings.js'

const router = Router()

function describeSaveFailure(err) {
  return err.cause?.message ?? err.name
}

router.get('/', async (_req, res) => {
  try {
    const [tokenConfigured, permissions] = await Promise.all([isHubspotConfigured(), getHubspotPermissions()])
    res.json({
      tokenConfigured,
      permissions,
      areas: describeHubspotAreas(),
      requiredScopes: requiredScopes(permissions),
    })
  } catch (err) {
    console.error('Failed to load the HubSpot settings:', err)
    res.status(500).json({ error: 'Failed to load the HubSpot settings.' })
  }
})

router.put('/token', async (req, res) => {
  const { error, value } = parseHubspotToken(req.body?.token)
  if (error) return res.status(400).json({ error })

  try {
    await setHubspotToken(value)
    res.json({ tokenConfigured: value.length > 0 })
  } catch (err) {
    console.error('Failed to save the HubSpot key:', describeSaveFailure(err))
    res.status(500).json({ error: 'Failed to save the HubSpot key.' })
  }
})

router.put('/permissions', async (req, res) => {
  const { error, value } = parseHubspotPermissions(req.body?.permissions)
  if (error) return res.status(400).json({ error })

  try {
    await setHubspotPermissions(value)
    res.json({ permissions: value, requiredScopes: requiredScopes(value) })
  } catch (err) {
    console.error('Failed to save the HubSpot permissions:', err)
    res.status(500).json({ error: 'Failed to save the HubSpot permissions.' })
  }
})

router.post('/test', async (_req, res) => {
  try {
    res.json(await getAccountDetails({ fresh: true }))
  } catch (err) {
    if (err.code === HUBSPOT_REQUEST_FAILED) return res.status(422).json({ error: err.message })

    console.error('Failed to test the HubSpot connection:', err)
    res.status(500).json({ error: 'Failed to test the HubSpot connection.' })
  }
})

export default router
