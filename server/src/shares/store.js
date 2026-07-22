import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../../data')
const DATA_FILE = path.join(DATA_DIR, 'shares.json')

const TTL_MS = 24 * 60 * 60 * 1000
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000

export class ShareStore {
  constructor() {
    this.shares = new Map()
    this._load()
    this._cleanupTimer = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS)
    this._cleanupTimer.unref()
  }

  create(messages) {
    const id = crypto.randomBytes(5).toString('hex')
    const now = Date.now()

    const firstUser = messages.find(m => m.role === 'user')
    const title = firstUser ? String(firstUser.content).slice(0, 120) : 'Shared conversation'

    const share = {
      id,
      title,
      messages: this._sanitize(messages),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + TTL_MS).toISOString(),
    }

    this.shares.set(id, share)
    this._persist()
    return share
  }

  get(id) {
    const share = this.shares.get(id)
    if (!share) return null

    if (Date.now() > new Date(share.expiresAt).getTime()) {
      this.shares.delete(id)
      this._persist()
      return null
    }

    return share
  }

  refresh(id, messages) {
    const share = this.shares.get(id)
    if (!share) return null

    const now = Date.now()
    share.messages = this._sanitize(messages)
    share.expiresAt = new Date(now + TTL_MS).toISOString()
    this._persist()
    return share
  }

  _sanitize(messages) {
    return messages.map(msg => {
      if (!msg.parts) return msg
      return {
        ...msg,
        parts: msg.parts.map(part => {
          if (part.type === 'tool_call') {
            const { startedAt: _startedAt, ...rest } = part
            return rest
          }
          return part
        }),
      }
    })
  }

  _cleanup() {
    const now = Date.now()
    let changed = false
    for (const [id, share] of this.shares) {
      if (now > new Date(share.expiresAt).getTime()) {
        this.shares.delete(id)
        changed = true
      }
    }
    if (changed) this._persist()
  }

  _persist() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true })
      const data = JSON.stringify(Object.fromEntries(this.shares), null, 2)
      const tmp = DATA_FILE + '.tmp'
      fs.writeFileSync(tmp, data, 'utf-8')
      fs.renameSync(tmp, DATA_FILE)
    } catch (err) {
      console.error('ShareStore: failed to persist:', err.message)
    }
  }

  _load() {
    try {
      if (!fs.existsSync(DATA_FILE)) return
      const raw = fs.readFileSync(DATA_FILE, 'utf-8')
      const obj = JSON.parse(raw)
      for (const [id, share] of Object.entries(obj)) {
        this.shares.set(id, share)
      }
    } catch (err) {
      console.error('ShareStore: failed to load:', err.message)
    }
  }

  destroy() {
    clearInterval(this._cleanupTimer)
  }
}
