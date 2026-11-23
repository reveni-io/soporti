import { Octokit } from '@octokit/rest'
import { getGithubToken } from './settings.js'
import { parseRepo } from './sanitize.js'

const REVIEW_THREADS_QUERY = `query ($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(last: 100) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          originalLine
          comments(first: 50) {
            nodes {
              fullDatabaseId
              author { login }
              body
            }
          }
        }
      }
    }
  }
}`

const RESOLVE_REVIEW_THREAD_MUTATION = `mutation ($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id }
  }
}`

const PATH_HISTORY_LIMIT = 20
const PULL_REQUEST_REVIEWS_LIMIT = 30
const COLLABORATION_LIMIT = 50
const PUSH_PERMISSIONS = new Set(['admin', 'write'])

let octokitInstance = null
let octokitInstanceToken = null

async function getOctokit() {
  const token = await getGithubToken()
  if (!token) {
    throw new Error('GitHub token not configured. Set it in the admin panel (GitHub section).')
  }
  if (!octokitInstance || octokitInstanceToken !== token) {
    octokitInstance = new Octokit({ auth: token })
    octokitInstanceToken = token
  }
  return octokitInstance
}

export async function getAuthenticatedUser() {
  const octokit = await getOctokit()
  const { data } = await octokit.users.getAuthenticated()

  return { login: data.login, id: data.id, name: data.name ?? null }
}

export async function getAuthenticatedLogin() {
  const { login } = await getAuthenticatedUser()
  return login
}

export async function getRepository(repoFullName) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const { data } = await octokit.repos.get({ owner, repo })
  return { fullName: data.full_name }
}

export async function getPullRequest(repoFullName, prNumber) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const { data } = await octokit.pulls.get({ owner, repo, pull_number: prNumber })
  return data
}

export async function createPullRequest(repoFullName, { title, body, head, base }) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const { data } = await octokit.pulls.create({ owner, repo, title, body, head, base, draft: true })

  return { number: data.number, url: data.html_url, title: data.title, draft: data.draft }
}

export async function listPullRequestFiles(repoFullName, prNumber) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const results = []
  const perPage = 100
  let page = 1

  while (true) {
    const { data } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: perPage,
      page,
    })

    results.push(...data)
    if (data.length < perPage) break
    page++
  }

  return results
}

export async function createPullRequestReview(repoFullName, prNumber, { commitId, body, event, comments }) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const params = {
    owner,
    repo,
    pull_number: prNumber,
    commit_id: commitId,
    body,
    event,
  }
  if (comments?.length > 0) params.comments = comments

  const { data } = await octokit.pulls.createReview(params)
  return data
}

export async function createIssueComment(repoFullName, issueNumber, body) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const { data } = await octokit.issues.createComment({ owner, repo, issue_number: issueNumber, body })
  return data
}

export async function updateIssueComment(repoFullName, commentId, body) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const { data } = await octokit.issues.updateComment({ owner, repo, comment_id: commentId, body })
  return data
}

export async function listIssueComments(repoFullName, issueNumber) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  return paginate(page => octokit.issues.listComments({ owner, repo, issue_number: issueNumber, per_page: 100, page }))
}

export async function listReviewComments(repoFullName, prNumber) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  return paginate(page => octokit.pulls.listReviewComments({ owner, repo, pull_number: prNumber, per_page: 100, page }))
}

export async function listPullRequestReviews(repoFullName, prNumber) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  return paginate(page => octokit.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: 100, page }))
}

export async function listReviewThreads(repoFullName, prNumber) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const data = await octokit.graphql(REVIEW_THREADS_QUERY, { owner, repo, number: prNumber })

  return (data.repository?.pullRequest?.reviewThreads?.nodes ?? []).map(thread => ({
    id: thread.id,
    isResolved: Boolean(thread.isResolved),
    isOutdated: Boolean(thread.isOutdated),
    path: thread.path,
    line: thread.line ?? thread.originalLine ?? null,
    comments: (thread.comments?.nodes ?? []).map(comment => ({
      databaseId: comment.fullDatabaseId ?? null,
      author: comment.author?.login ?? '',
      body: comment.body ?? '',
    })),
  }))
}

export async function updateReviewComment(repoFullName, commentId, body) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const { data } = await octokit.pulls.updateReviewComment({ owner, repo, comment_id: commentId, body })
  return data
}

export async function resolveReviewThread(threadId) {
  const octokit = await getOctokit()
  await octokit.graphql(RESOLVE_REVIEW_THREAD_MUTATION, { threadId })
}

export async function compareCommits(repoFullName, baseSha, headSha) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const { data } = await octokit.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${baseSha}...${headSha}` })
  return { status: data.status, files: data.files ?? [], mergeBaseSha: data.merge_base_commit?.sha ?? null }
}

export async function listCheckRuns(repoFullName, ref) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const { data } = await octokit.checks.listForRef({ owner, repo, ref, per_page: 100 })

  return (data.check_runs ?? []).map(run => ({
    name: run.name,
    status: run.status,
    conclusion: run.conclusion ?? null,
    title: run.output?.title ?? '',
    summary: run.output?.summary ?? '',
  }))
}

export async function listCommitStatuses(repoFullName, ref) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const { data } = await octokit.repos.getCombinedStatusForRef({ owner, repo, ref, per_page: 100 })

  return (data.statuses ?? []).map(status => ({
    context: status.context,
    state: status.state,
    description: status.description ?? '',
  }))
}

export async function createReviewCommentReply(repoFullName, prNumber, commentId, body) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const { data } = await octokit.pulls.createReplyForReviewComment({
    owner,
    repo,
    pull_number: prNumber,
    comment_id: commentId,
    body,
  })
  return data
}

export async function createIssueReaction(repoFullName, issueNumber, content) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const { data } = await octokit.reactions.createForIssue({ owner, repo, issue_number: issueNumber, content })
  return data
}

export async function deleteIssueReaction(repoFullName, issueNumber, reactionId) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  await octokit.reactions.deleteForIssue({ owner, repo, issue_number: issueNumber, reaction_id: reactionId })
}

export async function createIssueCommentReaction(repoFullName, commentId, content) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const { data } = await octokit.reactions.createForIssueComment({ owner, repo, comment_id: commentId, content })
  return data
}

export async function createReviewCommentReaction(repoFullName, commentId, content) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const { data } = await octokit.reactions.createForPullRequestReviewComment({
    owner,
    repo,
    comment_id: commentId,
    content,
  })
  return data
}

export async function listPathReviewers(repoFullName, ref, paths, { since, limit = PATH_HISTORY_LIMIT }) {
  if (paths.length === 0) return []

  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const definitions = paths.map((_, index) => `$p${index}: String!`).join(', ')
  const fields = paths
    .map((_, index) => {
      return `f${index}: history(first: ${limit}, path: $p${index}, since: $since) { nodes { associatedPullRequests(first: 1) { nodes { number reviews(first: ${PULL_REQUEST_REVIEWS_LIMIT}) { nodes { author { login } } } } } } }`
    })
    .join('\n')
  const query = `query ($owner: String!, $repo: String!, $ref: String!, $since: GitTimestamp!, ${definitions}) {
  repository(owner: $owner, name: $repo) { object(expression: $ref) { ... on Commit { ${fields} } } }
}`
  const variables = Object.fromEntries(paths.map((path, index) => [`p${index}`, path]))
  const data = await octokit.graphql(query, { owner, repo, ref, since, ...variables })
  const commit = data.repository?.object ?? {}

  return paths.map((path, index) => ({
    path,
    pullRequests: (commit[`f${index}`]?.nodes ?? [])
      .flatMap(node => node.associatedPullRequests?.nodes ?? [])
      .map(pullRequest => ({
        number: pullRequest.number,
        reviewers: (pullRequest.reviews?.nodes ?? []).map(review => review.author?.login).filter(Boolean),
      })),
  }))
}

export async function listCollaborators(owner, login, since) {
  const octokit = await getOctokit()
  const data = await octokit.graphql(
    `query ($authored: String!, $reviewed: String!) {
  authored: search(query: $authored, type: ISSUE, first: ${COLLABORATION_LIMIT}) { nodes { ... on PullRequest { reviews(first: ${PULL_REQUEST_REVIEWS_LIMIT}) { nodes { author { login } } } } } }
  reviewed: search(query: $reviewed, type: ISSUE, first: ${COLLABORATION_LIMIT}) { nodes { ... on PullRequest { author { login } } } }
}`,
    {
      authored: `is:pr user:${owner} author:${login} updated:>=${since}`,
      reviewed: `is:pr user:${owner} reviewed-by:${login} -author:${login} updated:>=${since}`,
    }
  )
  const reviewers = (data.authored?.nodes ?? []).flatMap(pullRequest => pullRequest.reviews?.nodes ?? [])
  const logins = [...reviewers, ...(data.reviewed?.nodes ?? [])].map(node => node.author?.login).filter(Boolean)

  return [...new Set(logins)]
}

export async function countReviewsSince(owner, logins, since) {
  if (logins.length === 0) return new Map()

  const octokit = await getOctokit()
  const definitions = logins.map((_, index) => `$q${index}: String!`).join(', ')
  const fields = logins.map((_, index) => `r${index}: search(query: $q${index}, type: ISSUE, first: 1) { issueCount }`)
  const variables = Object.fromEntries(
    logins.map((login, index) => [
      `q${index}`,
      `is:pr user:${owner} reviewed-by:${login} -author:${login} updated:>=${since}`,
    ])
  )
  const data = await octokit.graphql(`query (${definitions}) {\n${fields.join('\n')}\n}`, variables)

  return new Map(logins.map((login, index) => [login, data[`r${index}`]?.issueCount ?? 0]))
}

export async function canPushToRepository(repoFullName, login) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)

  try {
    const { data } = await octokit.repos.getCollaboratorPermissionLevel({ owner, repo, username: login })
    return PUSH_PERMISSIONS.has(data.permission)
  } catch (err) {
    if (err.status === 404) return false
    throw err
  }
}

async function paginate(fetchPage) {
  const results = []
  const perPage = 100
  let page = 1

  while (true) {
    const { data } = await fetchPage(page)
    results.push(...data)
    if (data.length < perPage) break
    page++
  }

  return results
}

export async function listRepos() {
  const octokit = await getOctokit()
  const results = []
  const perPage = 100
  let page = 1

  while (true) {
    const { data } = await octokit.repos.listForAuthenticatedUser({
      per_page: perPage,
      page,
      sort: 'updated',
    })

    for (const repo of data) {
      results.push({
        fullName: repo.full_name,
        description: repo.description || '',
        language: repo.language,
        defaultBranch: repo.default_branch,
      })
    }

    if (data.length < perPage) break
    page++
  }

  return results
}
