import { AUTO_APPROVE_MODES, AUTO_APPROVE_ON, AUTO_APPROVE_SHADOW, REPO_NAME_RE } from '../constants.js'

const MAX_REPOS = 100

function parseRepo(repo) {
  const name = typeof repo?.name === 'string' ? repo.name.trim() : ''
  if (!REPO_NAME_RE.test(name)) return { error: 'Use the org/repo format for every repo, e.g. acme/docs.' }
  if (!AUTO_APPROVE_MODES.includes(repo.mode)) return { error: `${name}: the mode must be off, shadow or on.` }

  return { value: { name, mode: repo.mode } }
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

function describeRepoChange(previous, next) {
  return previous.mode === next.mode ? [] : [`${next.name} ${previous.mode} → ${next.mode}`]
}

export function describeGithubChanges(previous, next) {
  const before = new Map((previous.repos ?? []).map(repo => [repo.name, repo]))
  const after = new Set(next.repos.map(repo => repo.name))
  const changes = [...before.keys()].filter(name => !after.has(name)).map(name => `Removed ${name}`)

  for (const repo of next.repos) {
    const old = before.get(repo.name)
    changes.push(...(old ? describeRepoChange(old, repo) : [`Added ${repo.name} (${repo.mode})`]))
  }

  return changes
}

function namesNotSavedInShadow(previousRepos, nextRepos) {
  const savedModes = new Map(previousRepos.map(repo => [repo.name, repo.mode]))
  const isSavedInShadow = name => [AUTO_APPROVE_SHADOW, AUTO_APPROVE_ON].includes(savedModes.get(name))

  return nextRepos.filter(repo => repo.mode === AUTO_APPROVE_ON && !isSavedInShadow(repo.name)).map(repo => repo.name)
}

export function findGithubSaveError(previous, next) {
  const notInShadow = namesNotSavedInShadow(previous.repos ?? [], next.repos)
  if (notInShadow.length === 0) return null

  return `Shadow first: ${notInShadow.join(', ')} must be saved in shadow before it can be set to on.`
}
