import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { REPO_NAME_RE } from '../constants.js'
import { countCasesByGuardSince, countSentRepliesByGuardSince } from '../db/legal-cases.js'
import { getShadowStats } from '../db/auto-approve-evaluations.js'
import { countJevCallsByProjectSince, countJevCallsBySetVersion } from '../db/jev-calls.js'
import {
  deleteJevDocument,
  getJevDocument,
  getLatestJevSave,
  listJevSetVersions,
  saveJevDocument,
} from '../db/jev-documents.js'
import { getRepository } from '../github/client.js'
import { getGithubToken } from '../github/settings.js'
import { JevApiError, listModels } from '../jev/client.js'
import {
  defaultJevDocument,
  isCustomGuardId,
  isJevDocument,
  parseGuardName,
  parseJevDocument,
  planJevSave,
} from '../jev/documents.js'
import { findGuardByName, listGuards } from '../guards/registry.js'
import { isConfigured, setJevApiKey } from '../jev/settings.js'

const CUSTOM_GUARD_PREFIX = 'guard-'
const CUSTOM_GUARD_ID_BYTES = 4
const MAX_API_KEY_LENGTH = 300
const WHITESPACE_RE = /\s/
const PAGE_RE = /^[1-9]\d{0,5}$/
const UNREADABLE_REPO_STATUSES = new Set([401, 403, 404])
const MAX_STATS_REPOS = 100
const DAY_MS = 24 * 60 * 60 * 1000
const NO_KEY_TEST_MESSAGE = 'No API key saved. Save the key above and test again.'
const USAGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

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

  if (!isPlainObject(body.data)) return { error: '"data" must be an object.' }

  const data = parseJevDocument(id, { ...defaultJevDocument(id), ...body.data })
  if (data.error) return data

  return { value: { rev: body.rev, data: body.data, restoredFrom: restoredFrom.value } }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function planMergedSave(id, current, { data, restoredFrom }) {
  const next = parseJevDocument(id, { ...current.data, ...data })
  if (next.error) return next

  return planJevSave(current, next.value, { restoredFrom })
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
    res.json({ keyConfigured: await isConfigured() })
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
    if (!(await isConfigured())) return res.status(422).json({ error: NO_KEY_TEST_MESSAGE })

    const startedAt = Date.now()
    await listModels()
    res.json({ latencyMs: Date.now() - startedAt })
  } catch (err) {
    sendFailure(res, err, 'test the Jev connection')
  }
})

function countOf(rows, guardId, field) {
  return rows.find(row => row.guardId === guardId || row.project === guardId)?.[field] ?? 0
}

async function listGuardsWithUsage() {
  const since = new Date(Date.now() - USAGE_WINDOW_MS)
  const [guards, calls, cases, replies] = await Promise.all([
    listGuards(),
    countJevCallsByProjectSince(since),
    countCasesByGuardSince(since),
    countSentRepliesByGuardSince(since),
  ])

  return guards.map(guard => ({
    ...guard,
    usage: {
      calls: countOf(calls, guard.id, 'calls'),
      cases: countOf(cases, guard.id, 'cases'),
      sentReplies: countOf(replies, guard.id, 'replies'),
    },
  }))
}

function describeNameClash(name) {
  return `There is already a guard called "${name}". Pick another name.`
}

async function findNameClash(id, name) {
  if (name === undefined) return null

  return findGuardByName(await listGuards(), name, { exceptId: id }) ? describeNameClash(name) : null
}

router.post('/guards', async (req, res) => {
  const { error, value: name } = parseGuardName(req.body?.name, { required: true })
  if (error) return res.status(400).json({ error })

  try {
    if (await findNameClash(null, name)) return res.status(409).json({ error: describeNameClash(name) })

    const id = `${CUSTOM_GUARD_PREFIX}${randomBytes(CUSTOM_GUARD_ID_BYTES).toString('hex')}`
    await saveJevDocument(id, {
      expectedRev: 0,
      author: req.user.email,
      defaults: { ...defaultJevDocument(id), name },
      plan: () => null,
    })

    res.status(201).json({ id, name })
  } catch (err) {
    console.error('Failed to create the guard:', err)
    res.status(500).json({ error: 'Failed to create the guard.' })
  }
})

router.delete('/guards/:guardId', async (req, res) => {
  const { guardId } = req.params
  if (!isCustomGuardId(guardId)) return res.status(404).json({ error: 'Unknown guard.' })

  try {
    const document = await getJevDocument(guardId)
    if (!document) return res.status(404).json({ error: 'Unknown guard.' })

    await deleteJevDocument(guardId)

    res.status(204).end()
  } catch (err) {
    console.error('Failed to delete the guard:', err)
    res.status(500).json({ error: 'Failed to delete the guard.' })
  }
})

router.get('/guards', async (_req, res) => {
  try {
    res.json({ guards: await listGuardsWithUsage() })
  } catch (err) {
    console.error('Failed to load the guards:', err)
    res.status(500).json({ error: 'Failed to load the guards.' })
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
    const clash = await findNameClash(id, value.data.name)
    if (clash) return res.status(409).json({ error: clash })

    const {
      conflict,
      error: saveError,
      document,
    } = await saveJevDocument(id, {
      expectedRev: value.rev,
      author: req.user.email,
      defaults: defaultJevDocument(id),
      plan: current => planMergedSave(id, current, value),
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

async function listVersionsWithCalls(id, page) {
  const versions = await listJevSetVersions(id, page)
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

export default router
