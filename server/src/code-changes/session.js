import { REPO_NAME_RE } from '../constants.js'
import { pool } from '../repo-pool/index.js'
import { withoutClonePath } from '../repo-pool/resolve-inside-clone.js'
import { redactSecrets } from '../review/output-guard.js'
import { deleteFileAt, editFileAt, parseContent, parseEdit, writeFileAt } from './file-edits.js'
import { hasUncommittedChanges, readHead } from './git.js'
import { loadContinuablePullRequest, noEditsMessage, publishChange } from './publish.js'
import { parseWritablePath } from './write-path.js'

const EXPIRED_MESSAGE =
  'This code change session expired after an hour without activity and its unpublished edits were discarded. Make the edits again.'

function parseRepoName(repo) {
  if (typeof repo !== 'string' || !REPO_NAME_RE.test(repo)) {
    throw new Error(`Invalid repository "${repo}". Expected "owner/repo".`)
  }

  return repo
}

function repoKey(repo) {
  return repo.toLowerCase()
}

function parsePullNumber(number) {
  const value = Number(number)
  if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid pull request number: ${number}.`)

  return value
}

async function openChange(repo, { branch = null, pr = null } = {}) {
  const worktree = await pool.acquireBranchWorktree(repo, { branch })

  try {
    const startSha = await readHead(worktree.localPath)
    return { repo, ...worktree, startSha, pushedSha: startSha, branch, pr }
  } catch (err) {
    await worktree.release()
    throw err
  }
}

async function hasUnpublishedEdits(change) {
  if (change.branch && !change.pr) return true
  if ((await readHead(change.localPath)) !== change.pushedSha) return true

  return hasUncommittedChanges(change.localPath)
}

function describePullRequest(pr) {
  return { number: pr.number, url: pr.url, title: pr.title, branch: pr.branch }
}

function scrubError(err, localPath) {
  const message = localPath ? withoutClonePath(err.message, localPath) : err.message

  return new Error(redactSecrets(withoutClonePath(message, pool.basePath)), { cause: err })
}

export class CodeChangeSession {
  constructor() {
    this.changes = new Map()
    this.queues = new Map()
    this.pending = 0
    this.lastUsed = Date.now()
    this.disposed = false
  }

  touch() {
    this.lastUsed = Date.now()
  }

  isIdle(now, idleMs) {
    return this.pending === 0 && now - this.lastUsed > idleMs
  }

  pendingPath(repo) {
    if (typeof repo !== 'string') return null

    return this.changes.get(repoKey(repo))?.localPath ?? null
  }

  editFile(repo, path, edit) {
    return this._run(repo, async () => {
      const safePath = parseWritablePath(path)
      const parsed = parseEdit(edit)
      const change = await this._ensureChange(repo)

      return editFileAt(change.localPath, safePath, parsed)
    })
  }

  writeFile(repo, path, content) {
    return this._run(repo, async () => {
      const safePath = parseWritablePath(path)
      const text = parseContent(content)
      const change = await this._ensureChange(repo)

      return writeFileAt(change.localPath, safePath, text)
    })
  }

  deleteFile(repo, path) {
    return this._run(repo, async () => {
      const safePath = parseWritablePath(path)
      const change = await this._ensureChange(repo)

      return deleteFileAt(change.localPath, safePath)
    })
  }

  continuePullRequest(repo, number) {
    return this._run(repo, () => this._continue(repo, parsePullNumber(number)))
  }

  openPullRequest(repo, { title, body = '', requestedBy = null } = {}) {
    return this._run(repo, async () => {
      const change = this.changes.get(repoKey(repo))
      if (!change) throw new Error(noEditsMessage(repo))

      return publishChange(change, { title, body, requestedBy })
    })
  }

  async dispose() {
    this.disposed = true

    const changes = [...this.changes.values()]
    this.changes.clear()

    await Promise.all(changes.map(change => change.release()))
  }

  async _keep(repo, change) {
    if (this.disposed) {
      await change.release()
      throw new Error(EXPIRED_MESSAGE)
    }

    this.changes.set(repoKey(repo), change)
    return change
  }

  async _ensureChange(repo) {
    const existing = this.changes.get(repoKey(repo))
    if (existing) return existing

    return this._keep(repo, await openChange(repo))
  }

  async _continue(repo, number) {
    const current = this.changes.get(repoKey(repo))

    if (current?.pr?.number === number) return describePullRequest(current.pr)
    if (current && (await hasUnpublishedEdits(current))) {
      throw new Error(
        `There are unpublished edits in ${repo}. Publish them with open_pull_request before continuing pull request #${number}.`
      )
    }

    const pr = await loadContinuablePullRequest(repo, number)
    await this._keep(repo, await openChange(repo, { branch: pr.branch, pr }))
    await current?.release()

    return describePullRequest(pr)
  }

  async _run(repo, operation) {
    const key = repoKey(parseRepoName(repo))
    const previous = this.queues.get(key) ?? Promise.resolve()
    const result = previous.then(() => this._track(repo, operation))
    const settled = result.catch(() => {})

    this.queues.set(key, settled)

    return result
  }

  async _track(repo, operation) {
    if (this.disposed) throw new Error(EXPIRED_MESSAGE)

    this.pending++
    this.touch()

    try {
      return await operation()
    } catch (err) {
      throw scrubError(err, this.pendingPath(repo))
    } finally {
      this.pending--
      this.touch()
    }
  }
}
