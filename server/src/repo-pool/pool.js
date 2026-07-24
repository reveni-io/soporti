import { execFile } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import config from '../config.js'
import { getGithubToken } from '../github/settings.js'

const execFileAsync = promisify(execFile)

const DEFAULT_BASE_PATH = join(tmpdir(), 'soporti-repos')

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
    const suffix = Math.random().toString(36).slice(2, 8)
    const worktreePath = `${base.localPath}--pr-${pr}-${suffix}`
    const localRef = `refs/reviews/pr-${pr}-${suffix}`

    try {
      await execFileAsync(
        'git',
        ['-C', base.localPath, 'fetch', '--depth', '1', 'origin', `+refs/pull/${pr}/head:${localRef}`],
        { timeout: 120_000 }
      )
      await execFileAsync('git', ['-C', base.localPath, 'worktree', 'add', '--detach', worktreePath, localRef], {
        timeout: 60_000,
      })
    } catch (err) {
      base.release()
      const safeMsg = (err.message || '').replace(/x-access-token:[^@]+@/g, 'x-access-token:***@')
      throw new Error(`Worktree failed for ${repoFullName}#${pr}: ${safeMsg}`, { cause: err })
    }

    let released = false
    return {
      localPath: worktreePath,
      release: async () => {
        if (released) return
        released = true
        try {
          await execFileAsync('git', ['-C', base.localPath, 'worktree', 'remove', '--force', worktreePath], {
            timeout: 60_000,
          })
        } catch {
          await rm(worktreePath, { recursive: true, force: true }).catch(() => {})
        }
        base.release()
      },
    }
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
      await execFileAsync('git', ['clone', '--depth', '1', url, dest], {
        timeout: 120_000,
      })
    } catch (err) {
      const safeMsg = (err.message || '').replace(/x-access-token:[^@]+@/g, 'x-access-token:***@')
      throw new Error(`Clone failed for ${repoFullName}: ${safeMsg}`, { cause: err })
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
