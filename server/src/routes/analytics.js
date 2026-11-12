import { Router } from 'express'
import dashboardsRouter from './analytics-dashboards.js'
import { claimCard, deleteCard, getCard, getCardDashboardId, updateCard } from '../db/analytics-cards.js'
import { parseChart, reconcileChart } from '../analytics/chart.js'
import { findGenerationRefusal } from '../analytics/generation-guard.js'
import { cancelGeneration, startGeneration } from '../analytics/generator.js'
import { parsePrompt, parseText } from '../analytics/input.js'
import { QueryError, readChartQuery, runChartQuery } from '../analytics/query.js'
import {
  ANALYTICS_STATUS_FAILED,
  ANALYTICS_STATUS_GENERATING,
  ANALYTICS_STATUS_READY,
  MAX_ANALYTICS_TITLE_LENGTH,
  UUID_RE,
} from '../constants.js'

const MAX_SQL_LENGTH = 20_000
const FRESH_FLAG = 'true'
const REVISABLE_STATUSES = [ANALYTICS_STATUS_READY, ANALYTICS_STATUS_FAILED]
const RETRYABLE_STATUSES = [ANALYTICS_STATUS_FAILED]

const EDIT_PARSERS = { title: parseTitle, sql: parseSql, chart: parseChart }

const NOT_FOUND_ERROR = 'Chart not found.'
const GENERATING_ERROR = 'The chart is still being generated. Wait for it to finish.'
const RETRY_CONFLICT_ERROR = 'Only a chart that failed can be retried.'
const NO_QUERY_ERROR = 'The chart has no query yet.'
const NOTHING_TO_CHANGE_ERROR = 'Send a title, a query or a chart to change.'

const router = Router()

function parseSql(value) {
  return parseText(value, { noun: 'query', maxLength: MAX_SQL_LENGTH })
}

function parseTitle(value) {
  return parseText(value, { noun: 'title', maxLength: MAX_ANALYTICS_TITLE_LENGTH })
}

function parseEdit(body) {
  const edit = {}

  for (const [field, parse] of Object.entries(EDIT_PARSERS)) {
    const raw = body?.[field]
    if (raw === undefined || raw === null) continue

    const parsed = parse(raw)
    if (parsed.error) return parsed

    edit[field] = parsed.value
  }
  if (Object.keys(edit).length === 0) return { error: NOTHING_TO_CHANGE_ERROR }

  return { value: edit }
}

async function sendMissingOrConflict(req, res, conflict) {
  const card = await getCard(req.params.id, req.user.id)
  if (!card) return res.status(404).json({ error: NOT_FOUND_ERROR })

  res.status(409).json({ error: conflict })
}

async function regenerate(req, res, { from, conflict, prompt = null }) {
  const userId = req.user.id

  const dashboardId = await getCardDashboardId(req.params.id, userId)
  if (!dashboardId) return res.status(404).json({ error: NOT_FOUND_ERROR })

  const refusal = await findGenerationRefusal(dashboardId, userId)
  if (refusal) return res.status(422).json({ error: refusal })

  const card = await claimCard(req.params.id, userId, { from, prompt })
  if (!card) return sendMissingOrConflict(req, res, conflict)

  startGeneration(card, userId)
  res.status(202).json({ card })
}

async function buildChanges(card, { title, sql, chart }) {
  const changes = {}
  if (title) changes.title = title
  if (chart) changes.chart = chart
  if (!sql || sql === card.sql) return changes

  const { columns } = await runChartQuery(sql)

  return { ...changes, sql, chart: reconcileChart(chart ?? card.chart, columns) }
}

async function editCard(req, res, edit) {
  const { id } = req.params

  const card = await getCard(id, req.user.id)
  if (!card) return res.status(404).json({ error: NOT_FOUND_ERROR })
  if (card.status === ANALYTICS_STATUS_GENERATING) return res.status(409).json({ error: GENERATING_ERROR })
  if (edit.chart && !edit.sql && !card.sql) return res.status(409).json({ error: NO_QUERY_ERROR })

  const updated = await updateCard(id, req.user.id, await buildChanges(card, edit))
  if (!updated) return sendMissingOrConflict(req, res, GENERATING_ERROR)

  res.json({ card: updated })
}

function sendQueryFailure(res, err, { log, message }) {
  if (err instanceof QueryError) return res.status(422).json({ error: err.message })

  console.error(log, err)
  res.status(500).json({ error: message })
}

router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid chart ID.' })

  next()
})

router.use('/dashboards', dashboardsRouter)

router.post('/cards/:id/revise', async (req, res) => {
  const prompt = parsePrompt(req.body?.prompt, 'change request')
  if (prompt.error) return res.status(400).json({ error: prompt.error })

  try {
    await regenerate(req, res, { from: REVISABLE_STATUSES, conflict: GENERATING_ERROR, prompt: prompt.value })
  } catch (err) {
    console.error('Failed to revise an analytics card:', err)
    res.status(500).json({ error: 'Failed to change the chart.' })
  }
})

router.post('/cards/:id/retry', async (req, res) => {
  try {
    await regenerate(req, res, { from: RETRYABLE_STATUSES, conflict: RETRY_CONFLICT_ERROR })
  } catch (err) {
    console.error('Failed to retry an analytics card:', err)
    res.status(500).json({ error: 'Failed to retry the chart.' })
  }
})

router.put('/cards/:id', async (req, res) => {
  const edit = parseEdit(req.body)
  if (edit.error) return res.status(400).json({ error: edit.error })

  try {
    await editCard(req, res, edit.value)
  } catch (err) {
    sendQueryFailure(res, err, { log: 'Failed to update an analytics card:', message: 'Failed to save the chart.' })
  }
})

router.delete('/cards/:id', async (req, res) => {
  const { id } = req.params

  try {
    if (!(await deleteCard(id, req.user.id))) return res.status(404).json({ error: NOT_FOUND_ERROR })

    cancelGeneration(id)
    res.json({ ok: true })
  } catch (err) {
    console.error('Failed to delete an analytics card:', err)
    res.status(500).json({ error: 'Failed to delete the chart.' })
  }
})

router.get('/cards/:id/data', async (req, res) => {
  try {
    const card = await getCard(req.params.id, req.user.id)
    if (!card) return res.status(404).json({ error: NOT_FOUND_ERROR })
    if (!card.sql) return res.status(409).json({ error: NO_QUERY_ERROR })

    const load = req.query.fresh === FRESH_FLAG ? runChartQuery : readChartQuery
    res.json(await load(card.sql))
  } catch (err) {
    sendQueryFailure(res, err, {
      log: 'Failed to load the data of an analytics card:',
      message: 'Failed to load the chart data.',
    })
  }
})

router.post('/query', async (req, res) => {
  const sql = parseSql(req.body?.sql)
  if (sql.error) return res.status(400).json({ error: sql.error })

  const chart = parseChart(req.body?.chart)
  if (chart.error) return res.status(400).json({ error: chart.error })

  try {
    const result = await runChartQuery(sql.value)
    res.json({ ...result, chart: reconcileChart(chart.value, result.columns) })
  } catch (err) {
    sendQueryFailure(res, err, { log: 'Failed to run an analytics query:', message: 'Failed to run the query.' })
  }
})

export default router
