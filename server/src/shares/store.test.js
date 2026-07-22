import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{}'),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
}))

const { ShareStore } = await import('./store.js')

describe('ShareStore', () => {
  let store

  beforeEach(() => {
    store = new ShareStore()
  })

  afterEach(() => {
    store.destroy()
  })

  describe('create', () => {
    it('creates a share with id and messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', parts: [{ type: 'text', content: 'Hi' }] },
      ]
      const share = store.create(messages)
      expect(share.id).toBeTruthy()
      expect(share.id.length).toBe(10)
      expect(share.messages).toEqual(messages)
      expect(share.createdAt).toBeTruthy()
      expect(share.expiresAt).toBeTruthy()
    })

    it('extracts title from first user message', () => {
      const share = store.create([{ role: 'user', content: 'How does auth work?' }])
      expect(share.title).toBe('How does auth work?')
    })

    it('truncates long titles to 120 chars', () => {
      const longMsg = 'a'.repeat(200)
      const share = store.create([{ role: 'user', content: longMsg }])
      expect(share.title.length).toBe(120)
    })

    it('uses default title if no user message', () => {
      const share = store.create([{ role: 'assistant', parts: [] }])
      expect(share.title).toBe('Shared conversation')
    })

    it('sanitizes tool_call startedAt from parts', () => {
      const messages = [
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              tool: 'search_code',
              input: {},
              done: true,
              startedAt: 12345,
              durationMs: 100,
            },
          ],
        },
      ]
      const share = store.create(messages)
      const part = share.messages[0].parts[0]
      expect(part.startedAt).toBeUndefined()
      expect(part.durationMs).toBe(100)
    })
  })

  describe('get', () => {
    it('retrieves an existing share', () => {
      const share = store.create([{ role: 'user', content: 'test' }])
      const retrieved = store.get(share.id)
      expect(retrieved).toEqual(share)
    })

    it('returns null for non-existent share', () => {
      expect(store.get('nonexistent')).toBeNull()
    })

    it('returns null for expired share', () => {
      const share = store.create([{ role: 'user', content: 'test' }])
      store.shares.get(share.id).expiresAt = new Date(Date.now() - 1000).toISOString()
      expect(store.get(share.id)).toBeNull()
    })
  })

  describe('refresh', () => {
    it('updates messages and extends expiry', () => {
      const share = store.create([{ role: 'user', content: 'first' }])
      const oldExpiry = share.expiresAt
      const newMessages = [
        { role: 'user', content: 'first' },
        { role: 'assistant', parts: [{ type: 'text', content: 'reply' }] },
      ]
      const refreshed = store.refresh(share.id, newMessages)
      expect(refreshed.messages.length).toBe(2)
      expect(new Date(refreshed.expiresAt).getTime()).toBeGreaterThanOrEqual(new Date(oldExpiry).getTime())
    })

    it('returns null for non-existent share', () => {
      expect(store.refresh('nonexistent', [])).toBeNull()
    })
  })

  describe('_cleanup', () => {
    it('removes expired shares', () => {
      const share = store.create([{ role: 'user', content: 'test' }])
      store.shares.get(share.id).expiresAt = new Date(Date.now() - 1000).toISOString()
      store._cleanup()
      expect(store.shares.has(share.id)).toBe(false)
    })

    it('keeps non-expired shares', () => {
      const share = store.create([{ role: 'user', content: 'test' }])
      store._cleanup()
      expect(store.shares.has(share.id)).toBe(true)
    })
  })

  describe('_load', () => {
    it('loads shares from file when it exists', async () => {
      const fs = await import('fs')
      fs.default.existsSync.mockReturnValue(true)
      fs.default.readFileSync.mockReturnValue(
        JSON.stringify({
          abc123: { id: 'abc123', title: 'Test', messages: [], expiresAt: new Date(Date.now() + 100000).toISOString() },
        })
      )

      const newStore = new ShareStore()
      expect(newStore.shares.has('abc123')).toBe(true)
      newStore.destroy()
    })

    it('handles load errors gracefully', async () => {
      const fs = await import('fs')
      fs.default.existsSync.mockReturnValue(true)
      fs.default.readFileSync.mockImplementation(() => {
        throw new Error('read error')
      })

      const newStore = new ShareStore()
      expect(newStore.shares.size).toBe(0)
      newStore.destroy()
    })
  })

  describe('_persist', () => {
    it('handles write errors gracefully', async () => {
      const fs = await import('fs')
      fs.default.writeFileSync.mockImplementation(() => {
        throw new Error('write error')
      })

      expect(() => store.create([{ role: 'user', content: 'test' }])).not.toThrow()
    })
  })
})
