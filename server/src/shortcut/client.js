import { getShortcutToken, isShortcutConfigured } from './settings.js'
import { findUserById } from '../db/users.js'
import { redactSecrets } from '../review/output-guard.js'

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
const UNKNOWN_MEMBER_ERROR =
  'Unknown or deactivated Shortcut member: call list_shortcut_members and use one of the ids it returns.'
const UNKNOWN_TEAM_ERROR =
  'Unknown or archived Shortcut team: call list_shortcut_teams and use one of the ids it returns.'
const UNKNOWN_STATE_ERROR = 'Unknown Shortcut workflow state'
const NOTHING_TO_UPDATE_ERROR = 'Nothing to update: pass at least one field to change.'
const NO_WORKFLOW_ERROR = 'The Shortcut workspace has no workflow to file the story into.'

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

async function getWorkflows() {
  return cached('workflows', async () => {
    const workflows = await request('GET', '/workflows')

    return (workflows || []).map(workflow => ({
      id: workflow.id,
      name: workflow.name,
      default_state_id: workflow.default_state_id ?? null,
      states: (workflow.states || []).map(state => ({ id: state.id, name: state.name, type: state.type })),
    }))
  })
}

async function getWorkflowStates() {
  const workflows = await getWorkflows()

  return toMap(
    workflows.flatMap(workflow => workflow.states),
    state => [state.id, state.name]
  )
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
        email: member.profile?.email_address?.toLowerCase() || null,
        role: member.role || null,
        disabled: Boolean(member.disabled),
      },
    ])
  })
}

async function getTeams() {
  return cached('teams', async () => {
    const teams = await request('GET', '/groups')

    return toMap(teams || [], team => [
      team.id,
      {
        id: team.id,
        name: team.name,
        mention_name: team.mention_name || null,
        archived: Boolean(team.archived),
        default_workflow_id: team.default_workflow_id ?? null,
        workflow_ids: team.workflow_ids || [],
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

export async function listTeams() {
  const teams = await getTeams()
  const active = [...teams.values()].filter(t => !t.archived)

  return {
    total: active.length,
    teams: active.map(({ id, name, mention_name }) => ({ id, name, mention_name })),
  }
}

export async function getMyMember(userId) {
  const user = userId ? await findUserById(userId) : null
  const email = typeof user?.email === 'string' ? user.email.toLowerCase() : null
  if (!email) return { member: null }

  const members = await getMembers()
  const match = [...members.values()].find(m => !m.disabled && m.email === email)
  if (!match) return { member: null }

  return { member: { id: match.id, name: match.name, mention_name: match.mention_name } }
}

async function requireMember(id) {
  const members = await getMembers()
  const member = members.get(id)
  if (!member || member.disabled) throw new Error(`${UNKNOWN_MEMBER_ERROR} Received "${id}".`)

  return member
}

async function requireTeam(id) {
  const teams = await getTeams()
  const team = teams.get(id)
  if (!team || team.archived) throw new Error(`${UNKNOWN_TEAM_ERROR} Received "${id}".`)

  return team
}

async function resolveOwnerIds(ids) {
  const owners = await Promise.all(ids.map(id => requireMember(id)))

  return owners.map(owner => owner.id)
}

function findStateByName(states, name) {
  const match = states.find(state => state.name.toLowerCase() === name.toLowerCase())
  if (!match) throw new Error(`${UNKNOWN_STATE_ERROR} "${name}". Available: ${states.map(s => s.name).join(', ')}.`)

  return match.id
}

async function resolveWorkflowStateId(name) {
  const workflows = await getWorkflows()

  return findStateByName(
    workflows.flatMap(workflow => workflow.states),
    name
  )
}

async function resolveTeamWorkflow(team) {
  const workflows = await getWorkflows()
  const preferred = team.default_workflow_id ?? team.workflow_ids[0] ?? null
  const workflow = workflows.find(candidate => candidate.id === preferred) || workflows[0]
  if (!workflow) throw new Error(NO_WORKFLOW_ERROR)

  return workflow
}

async function resolveInitialStateId(team, stateName) {
  const workflow = await resolveTeamWorkflow(team)
  if (stateName) return findStateByName(workflow.states, stateName)

  return workflow.default_state_id ?? workflow.states[0]?.id ?? null
}

async function toWrittenStory(story) {
  const [lookups, teams] = await Promise.all([getLookups(), getTeams()])

  return {
    ...toStorySummary(story, lookups),
    requested_by: lookups.members.get(story.requested_by_id)?.name || null,
    team: story.group_id ? teams.get(story.group_id)?.name || null : null,
  }
}

export async function createStory({
  name,
  description,
  storyType,
  teamId,
  requestedById = null,
  state = null,
  ownerIds = [],
  epicId = null,
  iterationId = null,
}) {
  const [requester, team, owners] = await Promise.all([
    requestedById ? requireMember(requestedById) : null,
    requireTeam(teamId),
    resolveOwnerIds(ownerIds),
  ])
  const workflowStateId = await resolveInitialStateId(team, state)

  const created = await request('POST', '/stories', {
    name: redactSecrets(name),
    description: redactSecrets(description),
    story_type: storyType,
    group_id: team.id,
    workflow_state_id: workflowStateId,
    owner_ids: owners,
    ...(requester ? { requested_by_id: requester.id } : {}),
    ...(epicId ? { epic_id: epicId } : {}),
    ...(iterationId ? { iteration_id: iterationId } : {}),
  })

  return toWrittenStory(created)
}

export async function updateStory(
  storyId,
  {
    name = null,
    description = null,
    storyType = null,
    state = null,
    ownerIds = null,
    epicId = null,
    iterationId = null,
  }
) {
  const changes = { name, description, storyType, state, ownerIds, epicId, iterationId }
  if (Object.values(changes).every(value => value === null)) throw new Error(NOTHING_TO_UPDATE_ERROR)

  const body = {}
  if (name !== null) body.name = redactSecrets(name)
  if (description !== null) body.description = redactSecrets(description)
  if (storyType !== null) body.story_type = storyType
  if (state !== null) body.workflow_state_id = await resolveWorkflowStateId(state)
  if (ownerIds !== null) body.owner_ids = await resolveOwnerIds(ownerIds)
  if (epicId !== null) body.epic_id = epicId
  if (iterationId !== null) body.iteration_id = iterationId

  const updated = await request('PUT', `/stories/${storyId}`, body)

  return toWrittenStory(updated)
}

export async function addComment({ storyId, text, authorId = null }) {
  const author = authorId ? await requireMember(authorId) : null

  const comment = await request('POST', `/stories/${storyId}/comments`, {
    text: redactSecrets(text),
    ...(author ? { author_id: author.id } : {}),
  })

  const members = await getMembers()

  return {
    id: comment.id,
    story_id: storyId,
    author: members.get(comment.author_id)?.name || null,
    app_url: comment.app_url || null,
  }
}

export async function isConfigured() {
  return isShortcutConfigured()
}

export function _resetShortcutClientCachesForTests() {
  caches.clear()
}
