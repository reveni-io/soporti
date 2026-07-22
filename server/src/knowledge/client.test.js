import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockVsSearch = vi.fn()
const mockVsRetrieve = vi.fn()
const mockVsFileCreate = vi.fn()
const mockFileCreate = vi.fn()

const mockClient = {
  vectorStores: {
    search: mockVsSearch,
    retrieve: mockVsRetrieve,
    files: { create: mockVsFileCreate },
  },
  files: { create: mockFileCreate },
}

const getOpenAIClient = vi.fn(async () => mockClient)
const getVectorStoreId = vi.fn(async () => 'vs_configured')

vi.mock('../openai/client.js', () => ({ getOpenAIClient }))
vi.mock('../openai/settings.js', () => ({ getVectorStoreId }))

const { searchSimilarCases, saveSolvedCase, countSolvedCases, isKnowledgeBaseConfigured } = await import('./client.js')

describe('knowledge client', () => {
  beforeEach(() => {
    mockVsSearch.mockReset()
    mockVsRetrieve.mockReset()
    mockVsFileCreate.mockReset()
    mockFileCreate.mockReset()
    getOpenAIClient.mockResolvedValue(mockClient)
    getVectorStoreId.mockResolvedValue('vs_configured')
  })

  describe('searchSimilarCases', () => {
    it('returns parsed cases from vector store', async () => {
      mockVsSearch.mockResolvedValue({
        data: [
          {
            content: [{ text: JSON.stringify({ question: 'How to X?', answer: 'Do Y.' }) }],
            score: 0.95,
          },
        ],
      })

      const results = await searchSimilarCases('How to X?')

      expect(results).toEqual([{ question: 'How to X?', answer: 'Do Y.', score: 0.95 }])
      expect(mockVsSearch).toHaveBeenCalledWith('vs_configured', { query: 'How to X?', max_num_results: 3 })
    })

    it('returns empty array on search error', async () => {
      mockVsSearch.mockRejectedValue(new Error('API error'))

      const results = await searchSimilarCases('test')

      expect(results).toEqual([])
    })

    it('skips items with invalid JSON', async () => {
      mockVsSearch.mockResolvedValue({
        data: [
          { content: [{ text: 'not json' }], score: 0.5 },
          {
            content: [{ text: JSON.stringify({ question: 'Q', answer: 'A' }) }],
            score: 0.8,
          },
        ],
      })

      const results = await searchSimilarCases('test')

      expect(results).toHaveLength(1)
      expect(results[0].question).toBe('Q')
    })

    it('returns empty array when data is empty', async () => {
      mockVsSearch.mockResolvedValue({ data: [] })

      const results = await searchSimilarCases('test')

      expect(results).toEqual([])
    })

    it('returns empty array when the vector store is not configured', async () => {
      getVectorStoreId.mockResolvedValue(null)

      const results = await searchSimilarCases('test')

      expect(results).toEqual([])
      expect(mockVsSearch).not.toHaveBeenCalled()
    })

    it('returns empty array when no API key is configured', async () => {
      getOpenAIClient.mockResolvedValue(null)

      const results = await searchSimilarCases('test')

      expect(results).toEqual([])
      expect(mockVsSearch).not.toHaveBeenCalled()
    })
  })

  describe('countSolvedCases', () => {
    it('returns the total file count of the vector store', async () => {
      mockVsRetrieve.mockResolvedValue({ file_counts: { total: 96 } })

      await expect(countSolvedCases()).resolves.toBe(96)
      expect(mockVsRetrieve).toHaveBeenCalledWith('vs_configured')
    })

    it('returns 0 when file counts are missing', async () => {
      mockVsRetrieve.mockResolvedValue({})

      await expect(countSolvedCases()).resolves.toBe(0)
    })

    it('returns 0 when the vector store is not configured', async () => {
      getVectorStoreId.mockResolvedValue(null)

      await expect(countSolvedCases()).resolves.toBe(0)
      expect(mockVsRetrieve).not.toHaveBeenCalled()
    })
  })

  describe('saveSolvedCase', () => {
    it('uploads file and adds to vector store', async () => {
      mockFileCreate.mockResolvedValue({ id: 'file_123' })
      mockVsFileCreate.mockResolvedValue({})

      const fileId = await saveSolvedCase('question', 'answer')

      expect(fileId).toBe('file_123')
      expect(mockFileCreate).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'assistants' }))
      expect(mockVsFileCreate).toHaveBeenCalledWith('vs_configured', { file_id: 'file_123' })
    })

    it('throws when the vector store is not configured', async () => {
      getVectorStoreId.mockResolvedValue(null)

      await expect(saveSolvedCase('q', 'a')).rejects.toThrow(/not configured/i)
      expect(mockFileCreate).not.toHaveBeenCalled()
    })
  })

  describe('isKnowledgeBaseConfigured', () => {
    it('is true when both the vector store and the client are set', async () => {
      await expect(isKnowledgeBaseConfigured()).resolves.toBe(true)
    })

    it('is false when the vector store is not configured', async () => {
      getVectorStoreId.mockResolvedValue(null)
      await expect(isKnowledgeBaseConfigured()).resolves.toBe(false)
    })

    it('is false when no API key is configured', async () => {
      getOpenAIClient.mockResolvedValue(null)
      await expect(isKnowledgeBaseConfigured()).resolves.toBe(false)
    })
  })
})
