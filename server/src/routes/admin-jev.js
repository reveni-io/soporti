import { Router } from 'express'
import { JEV_GITHUB_DOCUMENT, JEV_LEGAL_DOCUMENT, JEV_SETTINGS_DOCUMENT } from '../constants.js'
import { countJevCallsByProjectSince } from '../db/jev-calls.js'
import {
  addJevHistoryEntry,
  getJevDocument,
  getLatestJevSave,
  listJevHistory,
  saveJevDocument,
} from '../db/jev-documents.js'
import { JevApiError, listModels } from '../jev/client.js'
import { defaultJevDocument, isJevDocument, parseJevDocument, planJevSave } from '../jev/documents.js'
import { getJevApiKey, getJevModelCatalog, setJevApiKey, setJevModelCatalog } from '../jev/settings.js'

const MAX_API_KEY_LENGTH = 300
const WHITESPACE_RE = /\s/
const PAGE_RE = /^[1-9]\d{0,5}$/
const NO_KEY_TEST_MESSAGE = 'No API key saved. Save the key above and test again.'
const NO_KEY_SCAN_MESSAGE = 'No API key saved. Save the key above and scan again.'
const CALLS_OFF_MESSAGE = 'Jev calls are off. Turn them on and save before testing.'
const USAGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const PROJECTS = [JEV_GITHUB_DOCUMENT, JEV_LEGAL_DOCUMENT]

const router = Router()

function parseApiKey(value) {
  if (typeof value !== 'string') return { error: '"apiKey" must be a string (empty to remove it).' }

  const apiKey = value.trim()
  if (apiKey.length > MAX_API_KEY_LENGTH || WHITESPACE_RE.test(apiKey)) {
    return { error: 'That does not look like a valid Jev API key.' }
  }

  return { value: apiKey }
}

function parseSaveRequest(id, body) {
  if (!Number.isInteger(body?.rev) || body.rev < 0) return { error: '"rev" must be the version you edited.' }

  const data = parseJevDocument(id, body.data)
  if (data.error) return data

  return { value: { rev: body.rev, data: data.value } }
}

function parsePage(value) {
  if (value === undefined) return { value: 1 }
  if (typeof value !== 'string' || !PAGE_RE.test(value)) return { error: '"page" must be a positive whole number.' }

  return { value: Number(value) }
}

function describeKeyChange(hadKey, hasKey) {
  if (hasKey) return hadKey ? 'API key replaced' : 'API key saved'

  return hadKey ? 'API key removed' : null
}

function countNewModels(savedModels, scannedModels) {
  const known = new Set(savedModels.map(model => model.name))

  return scannedModels.filter(model => !known.has(model.name)).length
}

function toPayload(id, document, latestSave) {
  const saved = document ?? { rev: 0, data: defaultJevDocument(id), setVersion: 0 }

  return {
    id,
    rev: saved.rev,
    data: saved.data,
    setVersion: saved.setVersion,
    savedAt: latestSave?.at ?? null,
    savedBy: latestSave?.author ?? null,
  }
}

function describeConflict(document, latestSave, editedRev) {
  const author = latestSave?.author ?? 'Someone else'

  return `${author} saved version ${document.rev} while you were editing version ${editedRev}. Nothing was saved. Reload the latest version and apply your changes again.`
}

async function areJevCallsEnabled() {
  const settings = await getJevDocument(JEV_SETTINGS_DOCUMENT)

  return settings?.data?.enabled === true
}

function sendFailure(res, err, action) {
  if (err instanceof JevApiError) {
    console.error(`Failed to ${action}:`, err.message)
    return res.status(502).json({ error: `Could not ${action}: ${err.message}.` })
  }

  console.error(`Failed to ${action}:`, err)
  res.status(500).json({ error: `Failed to ${action}.` })
}

router.param('id', (req, res, next, id) => {
  if (!isJevDocument(id)) return res.status(404).json({ error: 'Unknown Jev document.' })

  next()
})

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
    const previous = await getJevApiKey()
    await setJevApiKey(value)

    const change = describeKeyChange(Boolean(previous), value.length > 0)
    if (change) await addJevHistoryEntry(JEV_SETTINGS_DOCUMENT, { author: req.user.email, change })

    res.json({ keyConfigured: value.length > 0 })
  } catch (err) {
    console.error('Failed to save the Jev API key:', err)
    res.status(500).json({ error: 'Failed to save the Jev API key.' })
  }
})

router.post('/test', async (_req, res) => {
  try {
    if (!(await getJevApiKey())) return res.status(422).json({ error: NO_KEY_TEST_MESSAGE })
    if (!(await areJevCallsEnabled())) return res.status(422).json({ error: CALLS_OFF_MESSAGE })

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

router.get('/usage', async (_req, res) => {
  try {
    const counts = await countJevCallsByProjectSince(new Date(Date.now() - USAGE_WINDOW_MS))
    const callsOf = project => counts.find(row => row.project === project)?.calls ?? 0

    res.json({ projects: PROJECTS.map(id => ({ id, calls: callsOf(id) })) })
  } catch (err) {
    console.error('Failed to load the Jev usage:', err)
    res.status(500).json({ error: 'Failed to load the Jev usage.' })
  }
})

router.get('/documents/:id', async (req, res) => {
  const { id } = req.params

  try {
    const [document, latestSave] = await Promise.all([getJevDocument(id), getLatestJevSave(id)])
    res.json(toPayload(id, document, latestSave))
  } catch (err) {
    console.error('Failed to load the Jev document:', err)
    res.status(500).json({ error: 'Failed to load the settings.' })
  }
})

router.put('/documents/:id', async (req, res) => {
  const { id } = req.params
  const { error, value } = parseSaveRequest(id, req.body)
  if (error) return res.status(400).json({ error })

  try {
    const { conflict, document } = await saveJevDocument(id, {
      expectedRev: value.rev,
      author: req.user.email,
      defaults: defaultJevDocument(id),
      plan: current => planJevSave(current, value.data),
    })
    const latestSave = await getLatestJevSave(id)
    if (conflict) return res.status(409).json({ error: describeConflict(document, latestSave, value.rev) })

    res.json(toPayload(id, document, latestSave))
  } catch (err) {
    console.error('Failed to save the Jev document:', err)
    res.status(500).json({ error: 'Failed to save the settings.' })
  }
})

router.get('/documents/:id/history', async (req, res) => {
  const { error, value: page } = parsePage(req.query.page)
  if (error) return res.status(400).json({ error })

  try {
    res.json(await listJevHistory(req.params.id, page))
  } catch (err) {
    console.error('Failed to load the Jev change history:', err)
    res.status(500).json({ error: 'Failed to load the change history.' })
  }
})

export default router
