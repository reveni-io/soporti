import { describe, it, expect } from 'vitest'
import { buildJevQuestions, readJevAnswers } from './questions.js'

const CHOICE = {
  id: 'q1',
  type: 'choice',
  text: 'Is the customer asking for something unusual?',
  instructions: 'Read the customer message.',
  criteria: '',
  answers: [
    { label: 'No', criteria: 'A usual request.', flag: false },
    { label: 'Yes', criteria: '', flag: true },
  ],
}
const NOUL = { id: 'q2', type: 'noul', text: 'The reply promises a refund', instructions: '', criteria: '', flagAt: 60 }

describe('buildJevQuestions', () => {
  it('maps each question to the API shape, keyed by its id', () => {
    expect(buildJevQuestions([CHOICE, NOUL])).toEqual({
      q1: {
        type: 'choice',
        instructions: {
          question: 'Is the customer asking for something unusual?',
          instructions: 'Read the customer message.',
        },
        criteria: { No: 'A usual request.', Yes: null },
      },
      q2: { type: 'noul', instructions: { question: 'The reply promises a refund' }, criteria: null },
    })
  })
})

describe('readJevAnswers', () => {
  it('reads a choice answer, its confidence and whether it is flagged', () => {
    const [row] = readJevAnswers([CHOICE], { q1: { type: 'choice', choice: 'Yes', confidence: 0.94 } }, 0.75)

    expect(row).toEqual({
      questionId: 'q1',
      question: 'Is the customer asking for something unusual?',
      answer: 'Yes',
      confidence: 0.94,
      flagged: true,
      unsure: false,
    })
  })

  it('turns a noul probability into a 0-100 score with its confidence', () => {
    const [high, low] = readJevAnswers(
      [NOUL, { ...NOUL, id: 'q3', flagAt: null }],
      { q2: { type: 'noul', noul: 0.9 }, q3: { type: 'noul', noul: 0.55 } },
      0.75
    )

    expect(high).toMatchObject({ answer: '90', flagged: true, unsure: false })
    expect(high.confidence).toBeCloseTo(0.8)
    expect(low).toMatchObject({ answer: '55', flagged: false, unsure: true })
    expect(low.confidence).toBeCloseTo(0.1)
  })

  it('marks an answer below the min confidence as unsure', () => {
    const [row] = readJevAnswers([CHOICE], { q1: { type: 'choice', choice: 'No', confidence: 0.64 } }, 0.75)

    expect(row).toMatchObject({ answer: 'No', flagged: false, unsure: true })
  })

  it('treats a missing or malformed answer as unsure', () => {
    const rows = readJevAnswers([CHOICE, NOUL], { q2: { type: 'noul', noul: 'high' } }, 0)

    expect(rows.map(({ answer, confidence, flagged, unsure }) => ({ answer, confidence, flagged, unsure }))).toEqual([
      { answer: null, confidence: 0, flagged: false, unsure: true },
      { answer: null, confidence: 0, flagged: false, unsure: true },
    ])
  })
})
