import { Octokit } from '@octokit/rest'
import { getGithubToken } from './settings.js'
import { parseRepo } from './sanitize.js'

const REVIEW_THREADS_QUERY = `query ($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(last: 100) {
        nodes {
          isResolved
          isOutdated
          path
          line
          originalLine
          comments(first: 50) {
            nodes {
              author { login }
              body
            }
          }
        }
      }
    }
  }
}`

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

export async function getAuthenticatedLogin() {
  const octokit = await getOctokit()
  const { data } = await octokit.users.getAuthenticated()
  return data.login
}

export async function getPullRequest(repoFullName, prNumber) {
  const octokit = await getOctokit()
  const { owner, repo } = parseRepo(repoFullName)
  const { data } = await octokit.pulls.get({ owner, repo, pull_number: prNumber })
  return data
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
    isResolved: Boolean(thread.isResolved),
    isOutdated: Boolean(thread.isOutdated),
    path: thread.path,
    line: thread.line ?? thread.originalLine ?? null,
    comments: (thread.comments?.nodes ?? []).map(comment => ({
      author: comment.author?.login ?? '',
      body: comment.body ?? '',
    })),
  }))
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
