import { Router } from 'express'
import { JEV_GITHUB_DOCUMENT, JEV_LEGAL_DOCUMENT, JEV_SETTINGS_DOCUMENT, REPO_NAME_RE } from '../constants.js'
import { countLegalRuns, listUncheckedLegalRuns } from '../db/legal-cases.js'
import { countLegalSchedules } from '../db/schedules.js'
import { getShadowStats } from '../db/auto-approve-evaluations.js'
import { countJevCallsByProjectSince, countJevCallsBySetVersion } from '../db/jev-calls.js'
import {
  addJevHistoryEntry,
  getJevDocument,
  getLatestJevSave,
  listJevHistory,
  listJevSetVersions,
  saveJevDocument,
} from '../db/jev-documents.js'
import { getRepository } from '../github/client.js'
import { getGithubToken } from '../github/settings.js'
import { JevApiError, listModels } from '../jev/client.js'
import { defaultJevDocument, isJevDocument, parseJevDocument, planJevSave } from '../jev/documents.js'
import { getJevApiKey, getJevModelCatalog, setJevApiKey, setJevModelCatalog } from '../jev/settings.js'

const MAX_API_KEY_LENGTH = 300
const WHITESPACE_RE = /\s/
const PAGE_RE = /^[1-9]\d{0,5}$/
const UNREADABLE_REPO_STATUSES = new Set([401, 403, 404])
const MAX_STATS_REPOS = 100
const DAY_MS = 24 * 60 * 60 * 1000
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

function parseRestoredFrom(value) {
  if (value === undefined || value === null) return { value: null }
  if (!Number.isInteger(value) || value < 1) return { error: '"restoredFrom" must be a set version.' }

  return { value }
}

function parseSaveRequest(id, body) {
  if (!Number.isInteger(body?.rev) || body.rev < 0) return { error: '"rev" must be the version you edited.' }

  const restoredFrom = parseRestoredFrom(body.restoredFrom)
  if (restoredFrom.error) return restoredFrom

  const data = parseJevDocument(id, body.data)
  if (data.error) return data

  return { value: { rev: body.rev, data: data.value, restoredFrom: restoredFrom.value } }
}

function parsePage(value) {
  if (value === undefined) return { value: 1 }
  if (typeof value !== 'string' || !PAGE_RE.test(value)) return { error: '"page" must be a positive whole number.' }

  return { value: Number(value) }
}

function parseRepoList(value) {
  const repos = typeof value === 'string' ? value.split(',').map(name => name.trim()) : []
  if (repos.length === 0 || repos.length > MAX_STATS_REPOS || !repos.every(name => REPO_NAME_RE.test(name))) {
    return { error: '"repos" must be a comma-separated list of org/repo names.' }
  }

  return { value: repos }
}

function toShadowStats(repo, rows) {
  const row = rows.find(stats => stats.repo === repo)
  if (!row) return { repo, evaluated: 0, wouldApprove: 0, days: 0 }

  const days = Math.max(1, Math.ceil((Date.now() - new Date(row.since).getTime()) / DAY_MS))

  return { repo, evaluated: row.evaluated, wouldApprove: row.wouldApprove, days }
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
    const inUseQueries = id === JEV_LEGAL_DOCUMENT ? await countLegalSchedules() : 0
    const {
      conflict,
      error: saveError,
      document,
    } = await saveJevDocument(id, {
      expectedRev: value.rev,
      author: req.user.email,
      defaults: defaultJevDocument(id),
      plan: current => planJevSave(current, value.data, { restoredFrom: value.restoredFrom, inUseQueries }),
    })
    if (saveError) return res.status(422).json({ error: saveError })

    const latestSave = await getLatestJevSave(id)
    if (conflict) return res.status(409).json({ error: describeConflict(document, latestSave, value.rev) })

    res.json(toPayload(id, document, latestSave))
  } catch (err) {
    console.error('Failed to save the Jev document:', err)
    res.status(500).json({ error: 'Failed to save the settings.' })
  }
})

function pageHandler(list, label) {
  return async function handlePage(req, res) {
    const { error, value: page } = parsePage(req.query.page)
    if (error) return res.status(400).json({ error })

    try {
      res.json(await list(req.params.id, page))
    } catch (err) {
      console.error(`Failed to load the Jev ${label}:`, err)
      res.status(500).json({ error: `Failed to load the ${label}.` })
    }
  }
}

router.get('/documents/:id/history', pageHandler(listJevHistory, 'change history'))

async function listVersionsWithCalls(id, page) {
  const versions = await listJevSetVersions(id, page)
  if (id !== JEV_LEGAL_DOCUMENT) return versions

  const calls = await countJevCallsBySetVersion(id)
  const callsOf = version => calls.find(row => row.setVersion === version)?.calls ?? 0

  return { ...versions, entries: versions.entries.map(entry => ({ ...entry, calls: callsOf(entry.version) })) }
}

router.get('/documents/:id/versions', pageHandler(listVersionsWithCalls, 'versions'))

router.post('/github/repos/check', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (!REPO_NAME_RE.test(name)) return res.status(400).json({ error: 'Use the org/repo format, e.g. acme/docs.' })

  try {
    if (!(await getGithubToken())) return res.status(422).json({ error: 'Save the GitHub token first.' })

    res.json(await getRepository(name))
  } catch (err) {
    if (!UNREADABLE_REPO_STATUSES.has(err.status)) {
      console.error('Failed to check the GitHub repo:', err)
      return res.status(500).json({ error: 'Failed to check the repo.' })
    }

    res.status(422).json({
      error: `The CI token cannot read ${name}. Give the token read access to the repo, or check the name.`,
    })
  }
})

router.get('/github/shadow-stats', async (req, res) => {
  const { error, value: repos } = parseRepoList(req.query.repos)
  if (error) return res.status(400).json({ error })

  try {
    const rows = await getShadowStats(repos)
    res.json({ repos: repos.map(repo => toShadowStats(repo, rows)) })
  } catch (err) {
    console.error('Failed to load the shadow results:', err)
    res.status(500).json({ error: 'Failed to load the shadow results.' })
  }
})

router.get('/legal/usage', async (req, res) => {
  const { error, value: page } = parsePage(req.query.page)
  if (error) return res.status(400).json({ error })

  try {
    const [queriesOn, runs, unchecked] = await Promise.all([
      countLegalSchedules(),
      countLegalRuns(),
      listUncheckedLegalRuns(page),
    ])
    res.json({ queriesOn, checkedRuns: runs.checked, uncheckedRuns: runs.notChecked, unchecked })
  } catch (err) {
    console.error('Failed to load the Legal usage:', err)
    res.status(500).json({ error: 'Failed to load the Legal usage.' })
  }
})

export default router
