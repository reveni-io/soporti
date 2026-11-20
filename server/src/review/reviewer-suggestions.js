import {
  canPushToRepository,
  countReviewsSince,
  findFirstPullRequestDates,
  listPathAuthors,
  listPullRequestReviews,
} from '../github/client.js'
import { getReviewerSuggestionsEnabled } from '../github/settings.js'
import { isBotLogin, isSameLogin, parseRepo } from '../github/sanitize.js'

const MAX_PATHS = 10
const AREA_HISTORY_LIMIT = 50
const MAX_AREA_PEOPLE = 50
const MAX_EXPERTS = 5
const LOAD_WINDOW_DAYS = 30
const NEWCOMER_DAYS = 180
const DAY_MS = 86_400_000
const LEARNING_RISKS = new Set(['Low', 'Medium'])
const LEARNING_EFFORTS = new Set([2, 3])

export async function suggestReviewers(context, { logger = console } = {}) {
  try {
    if (!(await getReviewerSuggestionsEnabled())) return null

    return await pickReviewers(context, logger)
  } catch (err) {
    logger.error(`[review] Could not suggest reviewers for ${context.trigger.dedupeKey}:`, err)
    return null
  }
}

async function pickReviewers(context, logger) {
  const { repoFullName } = context.trigger
  const { owner } = parseRepo(repoFullName)
  const taken = await listTakenReviewers(context)
  const paths = changedPaths(context.files)
  const experts = context.approved || taken.hasReviewer ? [] : await rankExperts(context.trigger, paths, taken.logins)
  const learners = isLearningPr(context)
    ? await findNewcomers({ trigger: context.trigger, paths, taken: taken.logins }, logger)
    : []
  const candidates = await keepPushers(repoFullName, [...new Set([...experts, ...learners])])

  if (candidates.size === 0) return null

  const load = await countReviewsSince(owner, [...candidates], daysAgo(LOAD_WINDOW_DAYS).toISOString().slice(0, 10))
  const expert = leastLoaded(experts, candidates, load)
  const learner = leastLoaded(
    learners.filter(login => !isSameLogin(login, expert)),
    candidates,
    load
  )

  return expert || learner ? { expert, learner } : null
}

function folderOf(path) {
  const slash = path.lastIndexOf('/')

  return slash > 0 ? path.slice(0, slash) : null
}

async function findNewcomers({ trigger, paths, taken }, logger) {
  const folders = [...new Set(paths.map(folderOf).filter(Boolean))]
  if (folders.length === 0) return []

  try {
    const history = await listPathAuthors(trigger.repoFullName, trigger.baseRef, folders, {
      limit: AREA_HISTORY_LIMIT,
    })
    const people = [...new Set(history.flatMap(({ authors }) => authors))]
      .filter(login => !isBotLogin(login) && !taken.has(login.toLowerCase()))
      .slice(0, MAX_AREA_PEOPLE)
    const firstPullRequests = await findFirstPullRequestDates(parseRepo(trigger.repoFullName).owner, people)
    const joinedAfter = daysAgo(NEWCOMER_DAYS).getTime()

    return people.filter(login => isNewcomer(firstPullRequests.get(login), joinedAfter))
  } catch (err) {
    logger.warn(`[review] Could not look for newcomers in ${trigger.repoFullName}: ${err.message}`)
    return []
  }
}

function isNewcomer(firstPullRequestAt, joinedAfter) {
  return !firstPullRequestAt || Date.parse(firstPullRequestAt) >= joinedAfter
}

async function listTakenReviewers({ trigger, pr, reviewerLogin }) {
  const reviews = await listPullRequestReviews(trigger.repoFullName, trigger.prNumber)
  const reviewers = [...(pr.requested_reviewers ?? []), ...reviews.map(review => review.user)]
    .map(user => user?.login)
    .filter(login => login && !isBotLogin(login) && !isSameLogin(login, reviewerLogin))
  const others = reviewers.filter(login => !isSameLogin(login, trigger.authorLogin))

  return {
    hasReviewer: others.length > 0 || (pr.requested_teams ?? []).length > 0,
    logins: new Set(
      [trigger.authorLogin, reviewerLogin, ...reviewers].filter(Boolean).map(login => login.toLowerCase())
    ),
  }
}

function changedPaths(files) {
  return files
    .filter(file => !file.generated)
    .sort((a, b) => b.changes - a.changes)
    .slice(0, MAX_PATHS)
    .map(file => file.previous_filename ?? file.filename)
}

async function rankExperts(trigger, paths, taken) {
  const history = await listPathAuthors(trigger.repoFullName, trigger.baseRef, paths)
  const touched = new Map()

  for (const login of history.flatMap(({ authors }) => [...new Set(authors)])) {
    touched.set(login, (touched.get(login) ?? 0) + 1)
  }

  const ranked = [...touched]
    .filter(([login]) => !isBotLogin(login) && !taken.has(login.toLowerCase()))
    .sort((a, b) => b[1] - a[1])
  const most = ranked[0]?.[1] ?? 0

  return ranked
    .filter(([, count]) => count * 2 >= most)
    .slice(0, MAX_EXPERTS)
    .map(([login]) => login)
}

function isLearningPr({ risk, effort }) {
  return LEARNING_RISKS.has(risk) && LEARNING_EFFORTS.has(effort)
}

async function keepPushers(repoFullName, logins) {
  const access = await Promise.all(logins.map(login => canPushToRepository(repoFullName, login)))

  return new Set(logins.filter((_, index) => access[index]))
}

function leastLoaded(logins, candidates, load) {
  const eligible = logins.filter(login => candidates.has(login))

  if (eligible.length === 0) return null

  return eligible.reduce((best, login) => (load.get(login) < load.get(best) ? login : best))
}

function daysAgo(days) {
  return new Date(Date.now() - days * DAY_MS)
}
