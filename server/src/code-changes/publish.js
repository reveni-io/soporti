import { createPullRequest, getAuthenticatedUser, getPullRequest } from '../github/client.js'
import { areGithubWritesEnabled, getGithubToken } from '../github/settings.js'
import { redactSecrets } from '../review/output-guard.js'
import { assertPushableBranch, buildBranchName, isSoportiBranch } from './branches.js'
import { commitAll, gitErrorDetail, hasUncommittedChanges, listChangedFiles, pushHead, readHead } from './git.js'

const MAX_TITLE_LENGTH = 256
const LINE_BREAKS_RE = /\s*[\r\n]+\s*/g
const PERMISSION_RE = /\b403\b|permission|denied|not accessible/i
const NOREPLY_EMAIL_DOMAIN = 'users.noreply.github.com'
const REDACTED_TOKEN = '***'
const WRITE_ACCESS_MESSAGE =
  'GitHub refused the change: the GitHub token needs write access to this repository (Contents and Pull requests: read and write). Update it in /admin → GitHub.'
const WRITES_DISABLED_MESSAGE =
  'Opening pull requests is turned off. An admin can enable GitHub writes in /admin → GitHub.'
const MISSING_TOKEN_MESSAGE = 'GitHub token not configured. Set it in the admin panel (GitHub section).'

export function noEditsMessage(repo) {
  return `There are no edits to publish in ${repo}. Make them with edit_file, write_file or delete_file first.`
}

function parseTitle(title) {
  if (typeof title !== 'string') throw new Error('A pull request needs a title.')

  const clean = redactSecrets(title.replace(LINE_BREAKS_RE, ' ').trim())
  if (!clean) throw new Error('A pull request needs a title.')
  if (clean.length > MAX_TITLE_LENGTH) {
    throw new Error(`The pull request title is too long (max ${MAX_TITLE_LENGTH} characters). Shorten it.`)
  }

  return clean
}

function buildBody(body, requestedBy) {
  const footer = requestedBy ? `\n\n---\n_Opened by Soporti for ${requestedBy}._` : '\n\n---\n_Opened by Soporti._'

  return `${redactSecrets(String(body ?? ''))}${footer}`
}

async function assertWritesEnabled() {
  if (!(await areGithubWritesEnabled())) throw new Error(WRITES_DISABLED_MESSAGE)
}

async function readCommitAuthor() {
  try {
    const { login, id, name } = await getAuthenticatedUser()
    return { name: name || login, email: `${id}+${login}@${NOREPLY_EMAIL_DOMAIN}` }
  } catch (err) {
    throw new Error(`Could not read the GitHub account behind the token: ${redactSecrets(err.message)}`, { cause: err })
  }
}

async function commitPendingEdits(change, message) {
  if (!(await hasUncommittedChanges(change.localPath))) return

  const author = await readCommitAuthor()
  await commitAll(change.localPath, { message, ...author }).catch(err => {
    throw new Error(`Committing the edits failed: ${gitErrorDetail(err)}`, { cause: err })
  })
}

function describePushFailure(err, { branch, token }) {
  const detail = redactSecrets(gitErrorDetail(err).replaceAll(token, REDACTED_TOKEN))

  if (PERMISSION_RE.test(detail)) return new Error(WRITE_ACCESS_MESSAGE, { cause: err })

  return new Error(`Pushing to ${branch} failed: ${detail}`, { cause: err })
}

async function pushToBranch(change, branch) {
  assertPushableBranch(branch, change.baseBranch)

  const token = await getGithubToken()
  if (!token) throw new Error(MISSING_TOKEN_MESSAGE)

  try {
    await pushHead(change.localPath, { url: `https://x-access-token:${token}@github.com/${change.repo}.git`, branch })
  } catch (err) {
    throw describePushFailure(err, { branch, token })
  }
}

function describePullRequestFailure(err) {
  if (err.status === 403) return new Error(WRITE_ACCESS_MESSAGE, { cause: err })

  return new Error(`GitHub refused to open the pull request: ${redactSecrets(err.message)}`, { cause: err })
}

async function openNewPullRequest(change, { title, body, requestedBy, headSha, files }) {
  const branch = change.branch ?? buildBranchName(title)

  if (headSha !== change.pushedSha) {
    await pushToBranch(change, branch)
    change.branch = branch
    change.pushedSha = headSha
  }

  const pr = await createPullRequest(change.repo, {
    title,
    body: buildBody(body, requestedBy),
    head: branch,
    base: change.baseBranch,
  }).catch(err => {
    throw describePullRequestFailure(err)
  })
  change.pr = { number: pr.number, url: pr.url, title: pr.title, branch, draft: pr.draft }

  return { ...change.pr, created: true, files }
}

async function updatePullRequest(change, { headSha, files }) {
  await pushToBranch(change, change.pr.branch)
  change.pushedSha = headSha

  return { ...change.pr, created: false, files }
}

export async function publishChange(change, { title, body, requestedBy }) {
  const cleanTitle = parseTitle(title)

  await assertWritesEnabled()
  await commitPendingEdits(change, cleanTitle)

  const headSha = await readHead(change.localPath)
  const isPullRequestPending = !change.pr && change.branch !== null
  if (headSha === change.pushedSha && !isPullRequestPending) throw new Error(noEditsMessage(change.repo))

  const files = await listChangedFiles(change.localPath, change.pr ? change.pushedSha : change.startSha)
  if (change.pr) return updatePullRequest(change, { headSha, files })

  return openNewPullRequest(change, { title: cleanTitle, body, requestedBy, headSha, files })
}

function describeLookupFailure(err, { repo, number }) {
  if (err.status === 404) return new Error(`Pull request #${number} was not found in ${repo}.`, { cause: err })

  return new Error(`Could not read pull request #${number} of ${repo}: ${redactSecrets(err.message)}`, { cause: err })
}

function describeClosedState(pr) {
  return pr.merged_at ? 'already merged' : 'closed'
}

function assertContinuable(pr, { repo, number }) {
  if (pr.state !== 'open') {
    throw new Error(
      `Pull request #${number} in ${repo} is ${describeClosedState(pr)}. Open a new pull request instead.`
    )
  }

  if (String(pr.head?.repo?.full_name ?? '').toLowerCase() !== repo.toLowerCase()) {
    throw new Error(
      `Pull request #${number} comes from a fork. Soporti can only continue pull requests whose branch lives in ${repo}.`
    )
  }

  if (!isSoportiBranch(pr.head?.ref)) {
    throw new Error(
      `Pull request #${number} was not opened by Soporti: its branch "${pr.head?.ref}" doesn't start with soporti/. Soporti only adds commits to its own pull requests.`
    )
  }
}

async function lookUpPullRequest(repo, number) {
  return getPullRequest(repo, number).catch(err => {
    throw describeLookupFailure(err, { repo, number })
  })
}

export async function readClosedState(repo, number) {
  const pr = await lookUpPullRequest(repo, number)
  if (pr.state === 'open') return null

  return describeClosedState(pr)
}

export async function loadContinuablePullRequest(repo, number) {
  const pr = await lookUpPullRequest(repo, number)

  assertContinuable(pr, { repo, number })

  return { number: pr.number, url: pr.html_url, title: pr.title, branch: pr.head.ref, draft: Boolean(pr.draft) }
}
