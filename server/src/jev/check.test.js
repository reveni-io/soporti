import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getJevDocument = vi.fn()
vi.mock('../db/jev-documents.js', () => ({ getJevDocument }))

const countJevCallsSince = vi.fn()
const recordJevCall = vi.fn()
vi.mock('../db/jev-calls.js', () => ({ countJevCallsSince, recordJevCall }))

const isConfigured = vi.fn()
vi.mock('./settings.js', () => ({ isConfigured }))

const askQuestions = vi.fn()
vi.mock('./client.js', async importOriginal => ({ ...(await importOriginal()), askQuestions }))

const { JevApiError } = await import('./client.js')
const { runJevCheck } = await import('./check.js')

const QUESTION = {
  id: 'q1',
  type: 'noul',
  text: 'The reply promises a refund',
  instructions: '',
  criteria: '',
  flagAt: 60,
}
const SET = {
  description: '',
  model: 'jev-latest',
  minConfidence: 0.75,
  timeoutSeconds: 45,
  dailyLimit: 0,
  questions: [QUESTION],
}
const STATE = { customerMessage: 'Where is my refund?' }

function mockDocuments({ enabled = true, set = SET } = {}) {
  getJevDocument.mockImplementation(async id => {
    if (id === 'jev') return { id, rev: 1, data: { enabled }, setVersion: 0 }
    return set ? { id, rev: 3, data: { set }, setVersion: 7 } : null
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDocuments()
  isConfigured.mockResolvedValue(true)
  countJevCallsSince.mockResolvedValue(0)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('runJevCheck', () => {
  it('asks the set questions about the state and records the call', async () => {
    askQuestions.mockResolvedValue({ model: 'jev-1.14.0', answers: { q1: { type: 'noul', noul: 0.1 } } })

    const result = await runJevCheck({ project: 'legal', state: STATE })

    expect(result).toEqual({
      status: 'answered',
      setVersion: 7,
      model: 'jev-1.14.0',
      rows: [
        {
          questionId: 'q1',
          question: 'The reply promises a refund',
          answer: '10',
          confidence: expect.closeTo(0.8),
          flagged: false,
          unsure: false,
        },
      ],
    })
    expect(askQuestions).toHaveBeenCalledTimes(1)
    expect(askQuestions).toHaveBeenCalledWith({
      model: 'jev-latest',
      state: STATE,
      questions: { q1: { type: 'noul', instructions: { question: 'The reply promises a refund' }, criteria: null } },
      timeoutMs: 45_000,
    })
    expect(recordJevCall).toHaveBeenCalledWith({
      project: 'legal',
      setVersion: 7,
      model: 'jev-latest',
      answeredModel: 'jev-1.14.0',
      status: 'answered',
    })
  })

  it('records a failed call and reports why', async () => {
    askQuestions.mockRejectedValue(new JevApiError('Jev error (HTTP 502)', 502))

    const result = await runJevCheck({ project: 'legal', state: STATE })

    expect(result).toEqual({
      status: 'unavailable',
      setVersion: 7,
      model: 'jev-latest',
      reason: 'Jev error (HTTP 502)',
    })
    expect(recordJevCall).toHaveBeenCalledWith({
      project: 'legal',
      setVersion: 7,
      model: 'jev-latest',
      status: 'failed',
      reason: 'Jev error (HTTP 502)',
    })
  })

  it('lets unexpected errors through', async () => {
    askQuestions.mockRejectedValue(new Error('boom'))

    await expect(runJevCheck({ project: 'legal', state: STATE })).rejects.toThrow('boom')
    expect(recordJevCall).not.toHaveBeenCalled()
  })

  it.each([
    ['the calls are off', () => mockDocuments({ enabled: false }), 'Jev calls are off'],
    ['no key is saved', () => isConfigured.mockResolvedValue(false), 'No API key saved'],
    ['the project was never saved', () => mockDocuments({ set: null }), 'No questions in the set'],
    ['no model is selected', () => mockDocuments({ set: { ...SET, model: '' } }), 'No model selected'],
  ])('does not call Jev when %s', async (_case, arrange, reason) => {
    arrange()

    const result = await runJevCheck({ project: 'legal', state: STATE })

    expect(result).toMatchObject({ status: 'unavailable', reason })
    expect(askQuestions).not.toHaveBeenCalled()
    expect(recordJevCall).not.toHaveBeenCalled()
  })

  it('does not call Jev with a document over the max characters', async () => {
    mockDocuments({ set: { ...SET, maxCharacters: 1_000 } })

    const result = await runJevCheck({ project: 'github', state: { diff: 'x'.repeat(2_000) } })

    expect(result.reason).toBe('Too large for Jev (2,011 characters, max 1,000)')
    expect(askQuestions).not.toHaveBeenCalled()
  })

  it('stops at the daily limit counted since midnight UTC', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-19T15:30:00.000Z'))
    mockDocuments({ set: { ...SET, dailyLimit: 50 } })
    countJevCallsSince.mockResolvedValue(50)

    const result = await runJevCheck({ project: 'legal', state: STATE })

    expect(result.reason).toBe('Daily limit exceeded (50 calls)')
    expect(countJevCallsSince).toHaveBeenCalledWith('legal', new Date('2026-11-19T00:00:00.000Z'))
    expect(askQuestions).not.toHaveBeenCalled()
  })

  it('calls Jev while under the daily limit', async () => {
    mockDocuments({ set: { ...SET, dailyLimit: 50 } })
    countJevCallsSince.mockResolvedValue(49)
    askQuestions.mockResolvedValue({ model: 'jev-1.14.0', answers: {} })

    expect((await runJevCheck({ project: 'legal', state: STATE })).status).toBe('answered')
  })
})
