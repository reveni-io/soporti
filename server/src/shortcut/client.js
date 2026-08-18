import { getShortcutToken, isShortcutConfigured } from './settings.js'

const BASE_URL = 'https://api.app.shortcut.com/api/v3'
const API_PREFIX = '/api/v3'
const LOOKUP_CACHE_TTL_MS = 5 * 60_000
const SEARCH_PAGE_SIZE = 25
const DEFAULT_SEARCH_LIMIT = 25
const MAX_SEARCH_LIMIT = 100
const MAX_SEARCH_PAGES = 10
const MAX_ITERATION_STORIES = 200
const MAX_ITERATIONS = 20
const MAX_EPICS = 50
const MAX_ERROR_CHARS = 500

const NOT_CONFIGURED_ERROR = 'Shortcut token not configured. Set it in the admin panel (Shortcut section).'

const EPIC_STATUS_DONE = 'done'
const EPIC_STATUS_IN_PROGRESS = 'in progress'
const EPIC_STATUS_TO_DO = 'to do'

const caches = new Map()

async function requireToken() {
  const token = await getShortcutToken()
  if (!token) throw new Error(NOT_CONFIGURED_ERROR)

  return token
}

async function request(method, path, body) {
  const token = await requireToken()

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Shortcut-Token': token,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Shortcut API ${method} ${path} failed (${res.status}): ${text.slice(0, MAX_ERROR_CHARS)}`)
  }

  return res.json()
}

async function cached(key, loader) {
  const token = await requireToken()
  const entry = caches.get(key)

  if (entry && entry.token === token && entry.expiresAt > Date.now()) return entry.value

  const value = await loader()
  caches.set(key, { token, value, expiresAt: Date.now() + LOOKUP_CACHE_TTL_MS })

  return value
}

function toMap(items, toEntry) {
  return new Map(items.map(toEntry))
}

async function getWorkflowStates() {
  return cached('workflow-states', async () => {
    const workflows = await request('GET', '/workflows')
    const states = (workflows || []).flatMap(w => w.states || [])

    return toMap(states, state => [state.id, state.name])
  })
}

async function getMembers() {
  return cached('members', async () => {
    const members = await request('GET', '/members')

    return toMap(members || [], member => [
      member.id,
      {
        id: member.id,
        name: member.profile?.name || member.profile?.mention_name || member.id,
        mention_name: member.profile?.mention_name || null,
        role: member.role || null,
        disabled: Boolean(member.disabled),
      },
    ])
  })
}

async function getEpicNames() {
  return cached('epic-names', async () => {
    const epics = await request('GET', '/epics')

    return toMap(epics || [], epic => [epic.id, epic.name])
  })
}

async function getIterationNames() {
  return cached('iteration-names', async () => {
    const iterations = await request('GET', '/iterations')

    return toMap(iterations || [], iteration => [iteration.id, iteration.name])
  })
}

async function getLookups() {
  const [states, members, epics, iterations] = await Promise.all([
    getWorkflowStates(),
    getMembers(),
    getEpicNames(),
    getIterationNames(),
  ])

  return { states, members, epics, iterations }
}

function resolveOwners(story, members) {
  return (story.owner_ids || []).map(id => members.get(id)?.name || id)
}

function toStorySummary(story, lookups) {
  return {
    id: story.id,
    name: story.name,
    story_type: story.story_type,
    state: lookups.states.get(story.workflow_state_id) || null,
    owners: resolveOwners(story, lookups.members),
    epic: story.epic_id ? lookups.epics.get(story.epic_id) || null : null,
    iteration: story.iteration_id ? lookups.iterations.get(story.iteration_id) || null : null,
    estimate: story.estimate,
    labels: (story.labels || []).map(l => l.name),
    blocked: Boolean(story.blocked),
    deadline: story.deadline,
    updated_at: story.updated_at,
    app_url: story.app_url,
  }
}

function countByState(stories) {
  const counts = {}
  for (const story of stories) {
    const state = story.state || 'unknown'
    counts[state] = (counts[state] || 0) + 1
  }

  return counts
}

export async function getStory(id) {
  const [story, lookups] = await Promise.all([request('GET', `/stories/${id}`), getLookups()])

  return {
    ...toStorySummary(story, lookups),
    description: story.description || '',
    tasks: (story.tasks || []).map(t => ({
      description: t.description,
      complete: t.complete,
    })),
  }
}

function clampLimit(limit) {
  const parsed = Number(limit)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_SEARCH_LIMIT

  return Math.min(Math.floor(parsed), MAX_SEARCH_LIMIT)
}

function toRelativePath(next) {
  return next.startsWith(API_PREFIX) ? next.slice(API_PREFIX.length) : next
}

export async function searchStories(query, { limit } = {}) {
  const wanted = clampLimit(limit)
  const lookups = await getLookups()

  const collected = []
  let total = 0
  let next = `/search/stories?page_size=${SEARCH_PAGE_SIZE}&query=${encodeURIComponent(query)}`
  let pages = 0

  while (next && collected.length < wanted && pages < MAX_SEARCH_PAGES) {
    const data = await request('GET', next)

    total = data.total ?? total
    collected.push(...(data.data || []))
    next = data.next ? toRelativePath(data.next) : null
    pages += 1
  }

  const stories = collected.slice(0, wanted).map(story => toStorySummary(story, lookups))

  return {
    total,
    returned: stories.length,
    truncated: total > stories.length,
    stories,
  }
}

function toIteration(iteration) {
  return {
    id: iteration.id,
    name: iteration.name,
    status: iteration.status,
    start_date: iteration.start_date,
    end_date: iteration.end_date,
    app_url: iteration.app_url,
  }
}

function byStartDateDesc(a, b) {
  return String(b.start_date || '').localeCompare(String(a.start_date || ''))
}

export async function listIterations({ status } = {}) {
  const iterations = await request('GET', '/iterations')
  const matching = (iterations || []).map(toIteration).filter(i => !status || i.status === status)
  const listed = matching.sort(byStartDateDesc).slice(0, MAX_ITERATIONS)

  return {
    total: matching.length,
    returned: listed.length,
    truncated: matching.length > listed.length,
    iterations: listed,
  }
}

export async function getIterationStories(iterationId) {
  const [iteration, rawStories, lookups] = await Promise.all([
    request('GET', `/iterations/${iterationId}`),
    request('GET', `/iterations/${iterationId}/stories`),
    getLookups(),
  ])

  const all = (rawStories || []).map(story => toStorySummary(story, lookups))
  const stories = all.slice(0, MAX_ITERATION_STORIES)

  return {
    iteration: toIteration(iteration),
    total: all.length,
    returned: stories.length,
    truncated: all.length > stories.length,
    by_state: countByState(all),
    stories,
  }
}

function resolveEpicStatus(epic) {
  if (epic.completed) return EPIC_STATUS_DONE
  if (epic.started) return EPIC_STATUS_IN_PROGRESS

  return EPIC_STATUS_TO_DO
}

function toEpic(epic) {
  return {
    id: epic.id,
    name: epic.name,
    status: resolveEpicStatus(epic),
    deadline: epic.deadline,
    stories: {
      unstarted: epic.stats?.num_stories_unstarted ?? 0,
      started: epic.stats?.num_stories_started ?? 0,
      done: epic.stats?.num_stories_done ?? 0,
    },
    app_url: epic.app_url,
  }
}

function byDeadlineThenName(a, b) {
  if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
  if (a.deadline) return -1
  if (b.deadline) return 1

  return a.name.localeCompare(b.name)
}

export async function listEpics({ status } = {}) {
  const epics = await request('GET', '/epics')
  const matching = (epics || []).map(toEpic).filter(e => !status || e.status === status)
  const listed = matching.sort(byDeadlineThenName).slice(0, MAX_EPICS)

  return {
    total: matching.length,
    returned: listed.length,
    truncated: matching.length > listed.length,
    epics: listed,
  }
}

export async function listMembers() {
  const members = await getMembers()
  const active = [...members.values()].filter(m => !m.disabled)

  return {
    total: active.length,
    members: active.map(({ id, name, mention_name, role }) => ({ id, name, mention_name, role })),
  }
}

export async function isConfigured() {
  return isShortcutConfigured()
}

export function _resetShortcutClientCachesForTests() {
  caches.clear()
}
