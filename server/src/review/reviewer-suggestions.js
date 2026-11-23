import { tool } from '@openai/agents'
import { z } from 'zod'
import {
  canPushToRepository,
  countReviewsSince,
  listCollaborators,
  listPathReviewers,
  listPullRequestReviews,
} from '../github/client.js'
import { isBotLogin, isSameLogin, parseRepo } from '../github/sanitize.js'

const MAX_PATHS = 10
const KNOWLEDGE_WINDOW_DAYS = 365
const TEAM_WINDOW_DAYS = 180
const LOAD_WINDOW_DAYS = 30
const DAY_MS = 86_400_000
const LOGIN_PREFIX_RE = /^@/
const ALREADY_REVIEWING = 'Someone is already reviewing this pull request, so there is no one to suggest.'
const NO_CANDIDATE =
  'Nobody in the team reviewed pull requests that changed these files, so there is no one to suggest.'
const NOT_SUGGESTED = 'Could not suggest a reviewer.'

function daysAgo(days) {
  return new Date(Date.now() - days * DAY_MS)
}

function toDay(date) {
  return date.toISOString().slice(0, 10)
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

function countKnowledge(history) {
  const reviewed = new Map()

  for (const { pullRequests } of history) {
    for (const { number, reviewers } of pullRequests) {
      for (const login of reviewers) reviewed.set(login, (reviewed.get(login) ?? new Set()).add(number))
    }
  }

  return new Map([...reviewed].map(([login, numbers]) => [login, numbers.size]))
}

function normalizeTeam(team) {
  return (team ?? []).map(login => login.trim().replace(LOGIN_PREFIX_RE, '').toLowerCase()).filter(Boolean)
}

async function loadTeam({ trigger }, team) {
  const named = normalizeTeam(team)
  if (named.length > 0) return new Set(named)

  const { owner } = parseRepo(trigger.repoFullName)
  const collaborators = await listCollaborators(owner, trigger.authorLogin, toDay(daysAgo(TEAM_WINDOW_DAYS)))

  return new Set(collaborators.map(login => login.toLowerCase()))
}

async function keepPushers(repoFullName, logins) {
  const access = await Promise.all(logins.map(login => canPushToRepository(repoFullName, login)))

  return logins.filter((_, index) => access[index])
}

function byLoadForKnowledge(a, b) {
  return a.load / a.knowledge - b.load / b.knowledge || b.knowledge - a.knowledge || a.login.localeCompare(b.login)
}

export async function pickReviewer(context, team) {
  const taken = await listTakenReviewers(context)
  if (taken.hasReviewer) return { reason: ALREADY_REVIEWING }

  const { repoFullName, baseRef } = context.trigger
  const [history, members] = await Promise.all([
    listPathReviewers(repoFullName, baseRef, changedPaths(context.files), {
      since: daysAgo(KNOWLEDGE_WINDOW_DAYS).toISOString(),
    }),
    loadTeam(context, team),
  ])
  const knowledge = countKnowledge(history)
  const known = [...knowledge.keys()].filter(login => {
    const lower = login.toLowerCase()
    return members.has(lower) && !isBotLogin(login) && !taken.logins.has(lower)
  })
  const candidates = await keepPushers(repoFullName, known)
  if (candidates.length === 0) return { reason: NO_CANDIDATE }

  const load = await countReviewsSince(parseRepo(repoFullName).owner, candidates, toDay(daysAgo(LOAD_WINDOW_DAYS)))
  const [suggestion] = candidates
    .map(login => ({ login, knowledge: knowledge.get(login), load: load.get(login) ?? 0 }))
    .sort(byLoadForKnowledge)

  return { suggestion }
}

function describeSuggestion({ login, knowledge, load }) {
  return `Suggested @${login}: reviewed ${knowledge} pull request(s) that changed these files, and ${load} pull request(s) in the last ${LOAD_WINDOW_DAYS} days.`
}

export function buildReviewerSuggestion(context, { logger = console } = {}) {
  let suggestion = null

  const suggestTool = tool({
    name: 'suggest_reviewer',
    description: [
      'Suggest one person to review this pull request. Use it only when the REVIEW.md asks for a reviewer suggestion.',
      'Soporti picks, among the people of the team who reviewed pull requests that changed these files, the one with the fewest recent reviews for how well they know these files, so the reviews spread by knowledge.',
      'If the REVIEW.md says which team owns the changed paths, or who is in each team, pass in `team` the GitHub logins of the team that owns the changed files, or else of the author’s team. Pass null when it names no team: Soporti then takes the people who reviewed the author’s pull requests, or whose pull requests the author reviewed, in the last six months.',
    ].join(' '),
    parameters: z.object({
      team: z
        .array(z.string())
        .nullable()
        .describe('The GitHub logins of the team, as the REVIEW.md lists them. Null when it names no team.'),
    }),
    execute: async ({ team }) => {
      try {
        const picked = await pickReviewer(context, team)
        if (picked.reason) return picked.reason

        suggestion = picked.suggestion
        return describeSuggestion(suggestion)
      } catch (err) {
        logger.error(`[review] Could not suggest a reviewer for ${context.trigger.dedupeKey}:`, err)
        return NOT_SUGGESTED
      }
    },
  })

  return { tool: suggestTool, read: () => suggestion }
}
