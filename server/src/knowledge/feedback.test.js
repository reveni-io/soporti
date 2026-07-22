import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client.js', () => ({
  saveSolvedCase: vi.fn(async () => 'file_saved'),
}))

import { saveSolvedCase } from './client.js'
import { storePendingFeedback, processFeedback, cleanupPendingFeedback } from './feedback.js'

describe('feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('storePendingFeedback', () => {
    it('returns a UUID feedback ID', () => {
      const id = storePendingFeedback('question', 'answer')
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })

    it('returns unique IDs for each call', () => {
      const id1 = storePendingFeedback('q1', 'a1')
      const id2 = storePendingFeedback('q2', 'a2')
      expect(id1).not.toBe(id2)
    })
  })

  describe('processFeedback', () => {
    it('saves to vector store on positive feedback', async () => {
      const id = storePendingFeedback('How to X?', 'Do Y.')
      const result = await processFeedback(id, true)

      expect(result).toEqual({ saved: true, fileId: 'file_saved' })
      expect(saveSolvedCase).toHaveBeenCalledWith('How to X?', 'Do Y.')
    })

    it('does not save on negative feedback', async () => {
      const id = storePendingFeedback('q', 'a')
      const result = await processFeedback(id, false)

      expect(result).toEqual({ saved: false, reason: 'negative' })
      expect(saveSolvedCase).not.toHaveBeenCalled()
    })

    it('returns not_found for unknown feedback ID', async () => {
      const result = await processFeedback('nonexistent-id', true)

      expect(result).toEqual({ saved: false, reason: 'not_found' })
      expect(saveSolvedCase).not.toHaveBeenCalled()
    })

    it('deletes entry after processing', async () => {
      const id = storePendingFeedback('q', 'a')
      await processFeedback(id, true)
      const result = await processFeedback(id, true)

      expect(result).toEqual({ saved: false, reason: 'not_found' })
    })
  })

  describe('cleanupPendingFeedback', () => {
    it('removes expired entries', () => {
      const id = storePendingFeedback('old', 'answer')

      const future = Date.now() + 2 * 60 * 60 * 1000
      vi.spyOn(Date, 'now').mockReturnValue(future)

      const cleaned = cleanupPendingFeedback()

      expect(cleaned).toBeGreaterThanOrEqual(1)

      vi.restoreAllMocks()

      // Confirm it was actually removed
      return processFeedback(id, true).then(result => {
        expect(result).toEqual({ saved: false, reason: 'not_found' })
      })
    })

    it('keeps fresh entries', async () => {
      const id = storePendingFeedback('fresh', 'answer')

      const cleaned = cleanupPendingFeedback()

      expect(cleaned).toBe(0)

      // Entry should still be accessible
      const result = await processFeedback(id, true)
      expect(result.saved).toBe(true)
    })
  })
})
