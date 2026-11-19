import { Router } from 'express'
import { JevApiError, listModels } from '../jev/client.js'
import { getJevApiKey, getJevModelCatalog, setJevApiKey, setJevModelCatalog } from '../jev/settings.js'

const MAX_API_KEY_LENGTH = 300
const WHITESPACE_RE = /\s/
const NO_KEY_TEST_MESSAGE = 'No API key saved. Save the key above and test again.'
const NO_KEY_SCAN_MESSAGE = 'No API key saved. Save the key above and scan again.'

const router = Router()

function parseApiKey(value) {
  if (typeof value !== 'string') return { error: '"apiKey" must be a string (empty to remove it).' }

  const apiKey = value.trim()
  if (apiKey.length > MAX_API_KEY_LENGTH || WHITESPACE_RE.test(apiKey)) {
    return { error: 'That does not look like a valid Jev API key.' }
  }

  return { value: apiKey }
}

function countNewModels(savedModels, scannedModels) {
  const known = new Set(savedModels.map(model => model.name))

  return scannedModels.filter(model => !known.has(model.name)).length
}

function sendFailure(res, err, action) {
  if (err instanceof JevApiError) {
    console.error(`Failed to ${action}:`, err.message)
    return res.status(502).json({ error: `Could not ${action}: ${err.message}.` })
  }

  console.error(`Failed to ${action}:`, err)
  res.status(500).json({ error: `Failed to ${action}.` })
}

router.get('/', async (_req, res) => {
  try {
    const [apiKey, catalog] = await Promise.all([getJevApiKey(), getJevModelCatalog()])
    res.json({ keyConfigured: Boolean(apiKey), models: catalog.models, scannedAt: catalog.scannedAt })
  } catch (err) {
    console.error('Failed to load the Jev settings:', err)
    res.status(500).json({ error: 'Failed to load the Jev settings.' })
  }
})

router.put('/api-key', async (req, res) => {
  const { error, value } = parseApiKey(req.body?.apiKey)
  if (error) return res.status(400).json({ error })

  try {
    await setJevApiKey(value)
    res.json({ keyConfigured: value.length > 0 })
  } catch (err) {
    console.error('Failed to save the Jev API key:', err)
    res.status(500).json({ error: 'Failed to save the Jev API key.' })
  }
})

router.post('/test', async (_req, res) => {
  try {
    if (!(await getJevApiKey())) return res.status(422).json({ error: NO_KEY_TEST_MESSAGE })

    const startedAt = Date.now()
    await listModels()
    res.json({ latencyMs: Date.now() - startedAt })
  } catch (err) {
    sendFailure(res, err, 'test the Jev connection')
  }
})

router.post('/models/scan', async (_req, res) => {
  try {
    if (!(await getJevApiKey())) return res.status(422).json({ error: NO_KEY_SCAN_MESSAGE })

    const [saved, models] = await Promise.all([getJevModelCatalog(), listModels()])
    const catalog = { models, scannedAt: new Date().toISOString() }
    await setJevModelCatalog(catalog)

    res.json({ ...catalog, newModels: countNewModels(saved.models, models) })
  } catch (err) {
    sendFailure(res, err, 'scan the Jev models')
  }
})

export default router
