import { execFile } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import config from '../config.js'
import { getGithubToken } from '../github/settings.js'
import { withoutClonePath } from './resolve-inside-clone.js'

const execFileAsync = promisify(execFile)

const DEFAULT_BASE_PATH = join(tmpdir(), 'soporti-repos')
const FETCH_TIMEOUT_MS = 120_000
const WORKTREE_TIMEOUT_MS = 60_000
const TOKEN_IN_URL_RE = /x-access-token:[^@]+@/g
const MASKED_TOKEN = 'x-access-token:***@'
const MAX_BRANCH_LENGTH = 255
const BRANCH_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/
const BRANCH_FORBIDDEN_RE = /\.\.|\/\/|\/\.|\.lock(?:\/|$)|[/.]$/
const RESERVED_BRANCH_NAMES = new Set(['HEAD'])

function withoutToken(text) {
  return String(text ?? '').replace(TOKEN_IN_URL_RE, MASKED_TOKEN)
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8)
}

function isValidBranchName(branch) {
  if (typeof branch !== 'string' || branch.length > MAX_BRANCH_LENGTH) return false
  if (branch.startsWith('refs/') || RESERVED_BRANCH_NAMES.has(branch)) return false

  return BRANCH_NAME_RE.test(branch) && !BRANCH_FORBIDDEN_RE.test(branch)
}

async function readCheckedOutBranch(clonePath) {
  const { stdout } = await execFileAsync('git', ['-C', clonePath, 'rev-parse', '--abbrev-ref', 'HEAD'], {
    timeout: WORKTREE_TIMEOUT_MS,
  })
  const branch = String(stdout ?? '').trim()

  if (!branch || branch === 'HEAD') throw new Error('The clone has no default branch checked out.')

  return branch
}

async function checkoutWorktree(clonePath, { sourceRef, localRef, worktreePath }) {
  await execFileAsync('git', ['-C', clonePath, 'fetch', '--depth', '1', 'origin', `+${sourceRef}:${localRef}`], {
    timeout: FETCH_TIMEOUT_MS,
  })
  await execFileAsync('git', ['-C', clonePath, 'worktree', 'add', '--detach', worktreePath, localRef], {
    timeout: WORKTREE_TIMEOUT_MS,
  })
}

async function removeWorktree(clonePath, worktreePath) {
  try {
    await execFileAsync('git', ['-C', clonePath, 'worktree', 'remove', '--force', worktreePath], {
      timeout: WORKTREE_TIMEOUT_MS,
    })
  } catch {
    await rm(worktreePath, { recursive: true, force: true }).catch(() => {})
  }
}

async function deleteLocalRef(clonePath, localRef) {
  const args = ['-C', clonePath, 'update-ref', '-d', localRef]

  await execFileAsync('git', args, { timeout: WORKTREE_TIMEOUT_MS }).catch(() => {})
}

function worktreeRelease(base, { worktreePath, localRef = null }) {
  let released = false

  return async () => {
    if (released) return
    released = true

    await removeWorktree(base.localPath, worktreePath)
    if (localRef) await deleteLocalRef(base.localPath, localRef)
    base.release()
  }
}

export class RepoPool {
  constructor({
    maxSize = 20,
    ttlMs = 30 * 60_000,
    cleanupMs = 5 * 60_000,
    basePath = DEFAULT_BASE_PATH,
    getGithubToken = async () => null,
  } = {}) {
    this.maxSize = maxSize
    this.ttlMs = ttlMs
    this.basePath = basePath
    this.getGithubToken = getGithubToken
    this.entries = new Map()
    this._cleanupTimer = setInterval(() => this._cleanup(), cleanupMs)
    this._cleanupTimer.unref()
  }

  async acquire(repoFullName) {
    let entry = this.entries.get(repoFullName)

    if (entry) {
      if (!entry.ready) {
        await entry.clonePromise
      }
      entry.refCount++
      return this._handle(repoFullName, entry)
    }

    if (this.entries.size >= this.maxSize) {
      this._evictLRU()
    }

    const localPath = join(this.basePath, repoFullName.replace('/', '--'))
    entry = { localPath, refCount: 1, lastRelease: 0, clonePromise: null, ready: false }

    entry.clonePromise = this._clone(repoFullName, localPath)
    this.entries.set(repoFullName, entry)

    try {
      await entry.clonePromise
      entry.ready = true
    } catch (err) {
      this.entries.delete(repoFullName)
      await rm(localPath, { recursive: true, force: true }).catch(() => {})
      throw err
    }

    return this._handle(repoFullName, entry)
  }

  async acquireWorktree(repoFullName, prNumber) {
    const pr = Number(prNumber)
    if (!Number.isInteger(pr) || pr < 1) {
      throw new Error(`Invalid PR number: ${prNumber}`)
    }

    const base = await this.acquire(repoFullName)
    const suffix = randomSuffix()
    const worktreePath = `${base.localPath}--pr-${pr}-${suffix}`
    const localRef = `refs/reviews/pr-${pr}-${suffix}`

    try {
      await checkoutWorktree(base.localPath, { sourceRef: `refs/pull/${pr}/head`, localRef, worktreePath })
    } catch (err) {
      base.release()
      throw new Error(`Worktree failed for ${repoFullName}#${pr}: ${withoutToken(err.message)}`, { cause: err })
    }

    return { localPath: worktreePath, release: worktreeRelease(base, { worktreePath }) }
  }

  async acquireBranchWorktree(repoFullName, { branch = null } = {}) {
    if (branch !== null && !isValidBranchName(branch)) {
      throw new Error(`Invalid branch name: "${branch}".`)
    }

    const base = await this.acquire(repoFullName).catch(err => {
      throw new Error(this._withoutPaths(err.message), { cause: err })
    })
    const suffix = randomSuffix()
    const worktreePath = `${base.localPath}--change-${suffix}`
    const localRef = `refs/soporti/change-${suffix}`

    try {
      const baseBranch = await readCheckedOutBranch(base.localPath)
      await checkoutWorktree(base.localPath, {
        sourceRef: `refs/heads/${branch ?? baseBranch}`,
        localRef,
        worktreePath,
      })

      return { localPath: worktreePath, baseBranch, release: worktreeRelease(base, { worktreePath, localRef }) }
    } catch (err) {
      await deleteLocalRef(base.localPath, localRef)
      base.release()

      const detail = this._withoutPaths(err.stderr?.trim() || err.message)
      throw new Error(`Could not check out ${branch ?? 'the default branch'} of ${repoFullName}: ${detail}`, {
        cause: err,
      })
    }
  }

  _withoutPaths(text) {
    return withoutClonePath(withoutToken(text), this.basePath)
  }

  _handle(repoFullName, entry) {
    let released = false
    return {
      localPath: entry.localPath,
      release: () => {
        if (released) return
        released = true
        entry.refCount--
        entry.lastRelease = Date.now()
      },
    }
  }

  async _clone(repoFullName, dest) {
    await rm(dest, { recursive: true, force: true }).catch(() => {})
    await mkdir(dest, { recursive: true })

    const token = await this.getGithubToken()
    if (!token) {
      throw new Error(
        `Clone failed for ${repoFullName}: GitHub token not configured. Set it in the admin panel (GitHub section).`
      )
    }
    const url = `https://x-access-token:${token}@github.com/${repoFullName}.git`
    try {
      await execFileAsync('git', ['clone', '--depth', '1', url, dest], { timeout: FETCH_TIMEOUT_MS })
    } catch (err) {
      throw new Error(`Clone failed for ${repoFullName}: ${withoutToken(err.message)}`, { cause: err })
    }
  }

  _cleanup() {
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (entry.refCount === 0 && entry.lastRelease > 0 && now - entry.lastRelease > this.ttlMs) {
        this.entries.delete(key)
        rm(entry.localPath, { recursive: true, force: true }).catch(() => {})
      }
    }
  }

  _evictLRU() {
    let oldest = null
    let oldestKey = null

    for (const [key, entry] of this.entries) {
      if (entry.refCount === 0 && (oldest === null || entry.lastRelease < oldest.lastRelease)) {
        oldest = entry
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.entries.delete(oldestKey)
      rm(oldest.localPath, { recursive: true, force: true }).catch(() => {})
      return
    }

    throw new Error('RepoPool is full and all entries are in use. Try again later.')
  }

  async shutdown() {
    clearInterval(this._cleanupTimer)
    await rm(this.basePath, { recursive: true, force: true }).catch(() => {})
    this.entries.clear()
  }
}

export const pool = new RepoPool({
  maxSize: config.repoPool.maxSize,
  ttlMs: config.repoPool.ttlMs,
  cleanupMs: config.repoPool.cleanupMs,
  getGithubToken,
})
