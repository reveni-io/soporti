import {
  AUTO_APPROVE_MODES,
  AUTO_APPROVE_OFF,
  AUTO_APPROVE_ON,
  AUTO_APPROVE_SHADOW,
  REPO_NAME_RE,
} from '../constants.js'

const RULE_ROLES = ['veto', 'info']
const MAX_REPOS = 100
const MAX_DENYLIST_PATTERNS = 100
const MAX_PATTERN_CHARS = 200
const MAX_NITPICKS = 15
const MERGE_RISKS = ['Low', 'Medium', 'High']
const REVIEW_EFFORT_MINUTES = [5, 10, 20, 30]

export const GITHUB_RULES = [
  { id: 'ci', label: 'CI status' },
  { id: 'findings', label: 'Blocking findings' },
  { id: 'spec', label: 'Spec check' },
  { id: 'threads', label: 'Open review threads' },
  { id: 'walkthrough', label: 'Walkthrough' },
  { id: 'merge-risk', label: 'Max merge risk', limits: MERGE_RISKS },
  { id: 'review-effort', label: 'Max review effort', limits: REVIEW_EFFORT_MINUTES },
  {
    id: 'nitpicks',
    label: 'Max nitpicks',
    limits: Array.from({ length: MAX_NITPICKS + 1 }, (_, count) => count),
  },
  { id: 'denylist', label: 'Denylist' },
]

export const DEFAULT_GITHUB_RULES = [
  { id: 'ci', role: 'veto' },
  { id: 'findings', role: 'veto' },
  { id: 'spec', role: 'veto' },
  { id: 'threads', role: 'veto' },
  { id: 'walkthrough', role: 'info' },
  { id: 'merge-risk', role: 'veto', limit: 'Low' },
  { id: 'review-effort', role: 'veto', limit: 10 },
  { id: 'nitpicks', role: 'veto', limit: 3 },
  { id: 'denylist', role: 'veto' },
]

const RULES_BY_ID = new Map(GITHUB_RULES.map(rule => [rule.id, rule]))

function parseRule(rule) {
  const definition = RULES_BY_ID.get(rule?.id)
  if (!definition) return { error: 'Unknown rule.' }
  if (!RULE_ROLES.includes(rule.role)) return { error: `${definition.label}: the role must be veto or info.` }
  if (!definition.limits) return { value: { id: rule.id, role: rule.role } }
  if (!definition.limits.includes(rule.limit)) return { error: `${definition.label}: choose one of the limits.` }

  return { value: { id: rule.id, role: rule.role, limit: rule.limit } }
}

export function parseGithubRules(value) {
  if (!Array.isArray(value)) return { error: 'Rules must be a list.' }

  const rules = []
  for (const rule of value) {
    const result = parseRule(rule)
    if (result.error) return result

    rules.push(result.value)
  }

  if (new Set(rules.map(rule => rule.id)).size !== rules.length) return { error: 'A rule appears twice.' }

  return { value: rules }
}

function parseDenylist(value, name) {
  if (!Array.isArray(value)) return { error: `${name}: the denylist must be a list of paths.` }
  if (value.length > MAX_DENYLIST_PATTERNS) {
    return { error: `${name}: the denylist can have at most ${MAX_DENYLIST_PATTERNS} patterns.` }
  }

  const patterns = value.map(pattern => (typeof pattern === 'string' ? pattern.trim() : null))
  if (patterns.some(pattern => pattern === null || pattern.length > MAX_PATTERN_CHARS)) {
    return { error: `${name}: each denylist pattern must be text of at most ${MAX_PATTERN_CHARS} characters.` }
  }

  return { value: patterns.filter(Boolean) }
}

function parseRepo(repo) {
  const name = typeof repo?.name === 'string' ? repo.name.trim() : ''
  if (!REPO_NAME_RE.test(name)) return { error: 'Use the org/repo format for every repo, e.g. acme/docs.' }
  if (!AUTO_APPROVE_MODES.includes(repo.mode)) return { error: `${name}: the mode must be off, shadow or on.` }

  const denylist = parseDenylist(repo.denylist ?? [], name)
  if (denylist.error) return denylist

  return { value: { name, mode: repo.mode, jev: repo.jev !== false, denylist: denylist.value } }
}

export function parseGithubRepos(value) {
  if (!Array.isArray(value)) return { error: 'Repos must be a list.' }
  if (value.length > MAX_REPOS) return { error: `Auto-approve can list at most ${MAX_REPOS} repos.` }

  const repos = []
  for (const repo of value) {
    const result = parseRepo(repo)
    if (result.error) return result

    repos.push(result.value)
  }

  if (new Set(repos.map(repo => repo.name)).size !== repos.length) return { error: 'A repo appears twice.' }

  return { value: repos }
}

function isSame(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function describeRepoChange(previous, next) {
  const changes = []

  if (previous.mode !== next.mode) changes.push(`${next.name} ${previous.mode} → ${next.mode}`)
  if (previous.jev !== next.jev) changes.push(`${next.name}: Jev ${next.jev ? 'on' : 'off'}`)
  if (!isSame(previous.denylist, next.denylist)) changes.push(`${next.name}: denylist`)

  return changes
}

export function describeGithubChanges(previous, next) {
  const before = new Map((previous.repos ?? []).map(repo => [repo.name, repo]))
  const after = new Set(next.repos.map(repo => repo.name))
  const changes = [...before.keys()].filter(name => !after.has(name)).map(name => `Removed ${name}`)

  for (const repo of next.repos) {
    const old = before.get(repo.name)
    changes.push(...(old ? describeRepoChange(old, repo) : [`Added ${repo.name} (${repo.mode})`]))
  }
  if (!isSame(previous.set.rules, next.set.rules)) changes.push('Rules')

  return changes
}

function namesNotSavedInShadow(previousRepos, nextRepos) {
  const savedModes = new Map(previousRepos.map(repo => [repo.name, repo.mode]))
  const isSavedInShadow = name => [AUTO_APPROVE_SHADOW, AUTO_APPROVE_ON].includes(savedModes.get(name))

  return nextRepos.filter(repo => repo.mode === AUTO_APPROVE_ON && !isSavedInShadow(repo.name)).map(repo => repo.name)
}

export function findGithubSaveError(previous, next) {
  const notInShadow = namesNotSavedInShadow(previous.repos ?? [], next.repos)
  if (notInShadow.length > 0) {
    return `Shadow first: ${notInShadow.join(', ')} must be saved in shadow before it can be set to on.`
  }

  const hadQuestions = (previous.set?.questions?.length ?? 0) > 0
  const users = next.repos.filter(repo => repo.mode !== AUTO_APPROVE_OFF).map(repo => repo.name)
  if (hadQuestions && next.set.questions.length === 0 && users.length > 0) {
    return `Cannot delete the set: ${users.length} auto-approve repo${users.length === 1 ? '' : 's'} (${users.join(', ')}) use it. Set them to off and save first.`
  }

  return null
}
