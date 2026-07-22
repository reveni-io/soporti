import { Octokit } from '@octokit/rest'
import { getGithubToken } from './settings.js'
import { parseRepo } from './sanitize.js'

// The token lives in the database (admin panel → GitHub section), so the
// client is built lazily and rebuilt whenever the stored token changes.
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
