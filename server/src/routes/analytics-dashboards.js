import { Router } from 'express'
import { createCard, listCardLayouts, listCards, saveCardLayouts } from '../db/analytics-cards.js'
import {
  countDashboards,
  createDashboard,
  deleteDashboard,
  ensureDashboard,
  getDashboard,
  listDashboards,
  updateDashboard,
} from '../db/analytics-dashboards.js'
import { findGenerationRefusal } from '../analytics/generation-guard.js'
import { cancelGeneration, startGeneration } from '../analytics/generator.js'
import { parsePrompt, parseText } from '../analytics/input.js'
import { findFreeSlot, parseLayoutItems } from '../analytics/layout.js'
import { shortenText } from '../analytics/text.js'
import { isPostgresConfigured } from '../postgres/settings.js'
import {
  MAX_ANALYTICS_DASHBOARDS_PER_USER,
  MAX_ANALYTICS_DASHBOARD_NAME_LENGTH,
  MAX_ANALYTICS_TITLE_LENGTH,
  UUID_RE,
} from '../constants.js'

const DEFAULT_CARD_SIZE = { w: 6, h: 4 }

const NOT_FOUND_ERROR = 'Dashboard not found.'
const OWNER_ONLY_ERROR = 'Only the owner of a dashboard can rename, share or delete it.'
const INVALID_SHARED_ERROR = 'Shared must be true or false.'
const NOTHING_TO_CHANGE_ERROR = 'Send a name or a sharing setting to change.'
const TOO_MANY_DASHBOARDS_ERROR = `You can only have ${MAX_ANALYTICS_DASHBOARDS_PER_USER} dashboards. Delete one first.`

const router = Router()

function parseName(value) {
  return parseText(value, { noun: 'name', maxLength: MAX_ANALYTICS_DASHBOARD_NAME_LENGTH })
}

function parseDashboardChanges(body) {
  const { name, shared } = body ?? {}
  if (name === undefined && shared === undefined) return { error: NOTHING_TO_CHANGE_ERROR }
  if (shared !== undefined && typeof shared !== 'boolean') return { error: INVALID_SHARED_ERROR }

  const changes = shared === undefined ? {} : { shared }
  if (name === undefined) return { value: changes }

  const parsed = parseName(name)
  if (parsed.error) return parsed

  return { value: { ...changes, name: parsed.value } }
}

async function listWithFirstDashboard(userId) {
  const dashboards = await listDashboards(userId)
  if (dashboards.some(dashboard => dashboard.isOwner)) return dashboards

  await ensureDashboard(userId)

  return listDashboards(userId)
}

async function findOwnerRefusal(req) {
  const dashboard = await getDashboard(req.params.id, req.user.id)
  if (!dashboard) return { status: 404, error: NOT_FOUND_ERROR }
  if (!dashboard.isOwner) return { status: 403, error: OWNER_ONLY_ERROR }

  return null
}

async function addCard(req, res, prompt) {
  const { id } = req.params
  const userId = req.user.id

  if (!(await getDashboard(id, userId))) return res.status(404).json({ error: NOT_FOUND_ERROR })

  const refusal = await findGenerationRefusal(id, userId, { creating: true })
  if (refusal) return res.status(422).json({ error: refusal })

  const slot = findFreeSlot(await listCardLayouts(id, userId), DEFAULT_CARD_SIZE)
  const card = await createCard(id, {
    title: shortenText(prompt, MAX_ANALYTICS_TITLE_LENGTH),
    prompt,
    layout: { ...slot, ...DEFAULT_CARD_SIZE },
  })

  startGeneration(card, userId)
  res.status(202).json({ card })
}

router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid dashboard ID.' })

  next()
})

router.get('/', async (req, res) => {
  try {
    const [configured, dashboards] = await Promise.all([isPostgresConfigured(), listWithFirstDashboard(req.user.id)])
    res.json({ configured, dashboards })
  } catch (err) {
    console.error('Failed to list analytics dashboards:', err)
    res.status(500).json({ error: 'Failed to load your dashboards.' })
  }
})

router.post('/', async (req, res) => {
  const name = parseName(req.body?.name)
  if (name.error) return res.status(400).json({ error: name.error })

  try {
    if ((await countDashboards(req.user.id)) >= MAX_ANALYTICS_DASHBOARDS_PER_USER) {
      return res.status(422).json({ error: TOO_MANY_DASHBOARDS_ERROR })
    }

    res.status(201).json({ dashboard: await createDashboard(req.user.id, name.value) })
  } catch (err) {
    console.error('Failed to create an analytics dashboard:', err)
    res.status(500).json({ error: 'Failed to create the dashboard.' })
  }
})

router.put('/:id', async (req, res) => {
  const changes = parseDashboardChanges(req.body)
  if (changes.error) return res.status(400).json({ error: changes.error })

  try {
    const refusal = await findOwnerRefusal(req)
    if (refusal) return res.status(refusal.status).json({ error: refusal.error })

    const dashboard = await updateDashboard(req.params.id, req.user.id, changes.value)
    if (!dashboard) return res.status(404).json({ error: NOT_FOUND_ERROR })

    res.json({ dashboard })
  } catch (err) {
    console.error('Failed to update an analytics dashboard:', err)
    res.status(500).json({ error: 'Failed to save the dashboard.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const refusal = await findOwnerRefusal(req)
    if (refusal) return res.status(refusal.status).json({ error: refusal.error })

    const generatingCardIds = await deleteDashboard(req.params.id, req.user.id)
    if (!generatingCardIds) return res.status(404).json({ error: NOT_FOUND_ERROR })

    generatingCardIds.forEach(cancelGeneration)
    res.json({ ok: true })
  } catch (err) {
    console.error('Failed to delete an analytics dashboard:', err)
    res.status(500).json({ error: 'Failed to delete the dashboard.' })
  }
})

router.get('/:id/cards', async (req, res) => {
  const { id } = req.params

  try {
    const dashboard = await getDashboard(id, req.user.id)
    if (!dashboard) return res.status(404).json({ error: NOT_FOUND_ERROR })

    res.json({ dashboard, cards: await listCards(id, req.user.id) })
  } catch (err) {
    console.error('Failed to list analytics cards:', err)
    res.status(500).json({ error: 'Failed to load the charts of the dashboard.' })
  }
})

router.post('/:id/cards', async (req, res) => {
  const prompt = parsePrompt(req.body?.prompt, 'question')
  if (prompt.error) return res.status(400).json({ error: prompt.error })

  try {
    await addCard(req, res, prompt.value)
  } catch (err) {
    console.error('Failed to create an analytics card:', err)
    res.status(500).json({ error: 'Failed to create the chart.' })
  }
})

router.put('/:id/layout', async (req, res) => {
  const { id } = req.params

  const items = parseLayoutItems(req.body?.items)
  if (items.error) return res.status(400).json({ error: items.error })

  try {
    if (!(await getDashboard(id, req.user.id))) return res.status(404).json({ error: NOT_FOUND_ERROR })

    await saveCardLayouts(id, req.user.id, items.value)
    res.json({ ok: true })
  } catch (err) {
    console.error('Failed to save the analytics layout:', err)
    res.status(500).json({ error: 'Failed to save the layout.' })
  }
})

export default router
