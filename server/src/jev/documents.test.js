import { describe, it, expect } from 'vitest'
import { defaultJevDocument, isJevDocument, parseJevDocument, planJevSave } from './documents.js'

const CHOICE = {
  id: 'q1',
  type: 'choice',
  text: ' Does the change alter how money is refunded? ',
  instructions: 'Read the diff.',
  criteria: 'Ignore tests.',
  answers: [
    { label: 'Yes', criteria: 'A refund path changes.', flag: true },
    { label: 'No', criteria: 'No money logic is touched.' },
  ],
}
const NOUL = { id: 'q2', type: 'noul', text: 'Merging this change is risky', flagAt: 70 }

function legalSet(overrides = {}) {
  return {
    description: 'Customer reply guardrail',
    model: 'jev-latest',
    minConfidence: 0.75,
    timeoutSeconds: 30,
    dailyLimit: 0,
    questions: [CHOICE, NOUL],
    ...overrides,
  }
}

function parseLegal(overrides) {
  return parseJevDocument('legal', { set: legalSet(overrides) })
}

describe('isJevDocument', () => {
  it('knows the settings and the two projects only', () => {
    expect(['jev', 'github', 'legal'].every(isJevDocument)).toBe(true)
    expect(isJevDocument('toString')).toBe(false)
  })
})

describe('defaultJevDocument', () => {
  it('keeps Jev calls off and gives each project its defaults', () => {
    expect(defaultJevDocument('jev')).toEqual({ enabled: false })
    expect(defaultJevDocument('legal').set).toEqual({
      description: '',
      model: '',
      minConfidence: null,
      timeoutSeconds: 30,
      dailyLimit: 0,
      questions: [],
    })
    expect(defaultJevDocument('github').set.maxCharacters).toBe(100_000)
  })

  it('returns a fresh copy every time', () => {
    defaultJevDocument('legal').set.questions.push(CHOICE)

    expect(defaultJevDocument('legal').set.questions).toEqual([])
  })
})

describe('parseJevDocument', () => {
  it('normalizes a valid project set', () => {
    const { value } = parseLegal()

    expect(value.set.questions).toEqual([
      {
        id: 'q1',
        text: 'Does the change alter how money is refunded?',
        instructions: 'Read the diff.',
        criteria: 'Ignore tests.',
        type: 'choice',
        answers: [
          { label: 'Yes', criteria: 'A refund path changes.', flag: true },
          { label: 'No', criteria: 'No money logic is touched.', flag: false },
        ],
      },
      { id: 'q2', text: 'Merging this change is risky', instructions: '', criteria: '', type: 'noul', flagAt: 70 },
    ])
  })

  it('accepts an empty model and a noul question without a threshold', () => {
    const { value } = parseLegal({ model: '', questions: [{ ...NOUL, flagAt: null }] })

    expect(value.set.model).toBe('')
    expect(value.set.questions[0].flagAt).toBeNull()
  })

  it('validates the Jev settings switch', () => {
    expect(parseJevDocument('jev', { enabled: true })).toEqual({ value: { enabled: true } })
    expect(parseJevDocument('jev', { enabled: 'yes' })).toEqual({ error: '"enabled" must be true or false.' })
  })

  it('requires the max characters only in the GitHub project', () => {
    expect(parseJevDocument('github', { set: legalSet() })).toEqual({
      error: 'Max characters sent to Jev must be a positive whole number.',
    })
    expect(parseJevDocument('github', { set: legalSet({ maxCharacters: 50_000 }) }).value.set.maxCharacters).toBe(
      50_000
    )
  })

  it.each([
    [{ minConfidence: null }, 'Min confidence must be a number between 0 and 1.'],
    [{ minConfidence: 1.5 }, 'Min confidence must be a number between 0 and 1.'],
    [{ timeoutSeconds: 0 }, 'Timeout must be a whole number of seconds.'],
    [{ dailyLimit: -1 }, 'Daily limit must be a whole number. Use 0 for no limit.'],
    [{ model: 'jev latest' }, 'That does not look like a Jev model name.'],
    [{ description: 7 }, 'The set description must be text.'],
    [{ description: 'd'.repeat(501) }, 'The set description is too long (max 500 characters).'],
    [{ questions: 'none' }, 'Questions must be a list.'],
    [{ questions: Array.from({ length: 51 }, (_, i) => ({ ...NOUL, id: `q${i}` })) }, 'A set can have at most 50'],
    [{ questions: [NOUL, NOUL] }, 'Two questions have the same id.'],
    [{ questions: [{ ...NOUL, type: 'score' }] }, 'Question 1: The type must be choice or noul.'],
    [{ questions: [{ ...NOUL, text: '  ' }] }, 'Question 1: The question is required.'],
    [{ questions: [{ ...NOUL, id: undefined }] }, 'Question 1: The question id is required.'],
    [{ questions: [{ ...NOUL, flagAt: 101 }] }, 'Question 1: The score threshold must be a whole number from 0'],
    [{ questions: [{ ...CHOICE, answers: [CHOICE.answers[0]] }] }, 'A choice question needs at least two answers.'],
    [
      { questions: [{ ...CHOICE, answers: Array.from({ length: 256 }, (_, i) => ({ label: `a${i}` })) }] },
      'A choice question can have at most 255 answers.',
    ],
    [{ questions: [{ ...CHOICE, answers: [{ label: 'Yes' }, { label: 'Yes' }] }] }, 'Two answers have the same text.'],
    [{ questions: [{ ...CHOICE, answers: [{ label: '' }, { label: 'No' }] }] }, 'Each answer is required.'],
  ])('rejects %j', (overrides, error) => {
    expect(parseLegal(overrides).error).toContain(error)
  })
})

describe('planJevSave', () => {
  const saved = { set: legalSet() }

  it('does nothing when nothing changed', () => {
    expect(planJevSave({ rev: 3, data: saved }, { set: legalSet() })).toBeNull()
  })

  it('describes the first save and starts the set versions', () => {
    const plan = planJevSave({ rev: 0, data: defaultJevDocument('legal') }, saved)

    expect(plan.change).toBe(
      'Created; Set description; Questions; Model (empty) → jev-latest; Min confidence (empty) → 0.75'
    )
    expect(plan.set).toEqual({ model: 'jev-latest', minConfidence: 0.75, questions: saved.set.questions })
    expect(plan.data).toBe(saved)
  })

  it('bumps the set version when a question, the model or the min confidence change', () => {
    const questions = [{ ...CHOICE, text: 'Reworded' }, NOUL]

    expect(planJevSave({ rev: 3, data: saved }, { set: legalSet({ questions }) })).toEqual({
      data: { set: legalSet({ questions }) },
      change: 'Questions',
      set: { model: 'jev-latest', minConfidence: 0.75, questions },
    })
    expect(planJevSave({ rev: 3, data: saved }, { set: legalSet({ minConfidence: 0.8 }) }).set).not.toBeNull()
  })

  it('keeps the set version when only the description, timeout or daily limit change', () => {
    const plan = planJevSave(
      { rev: 3, data: saved },
      { set: legalSet({ description: 'New', timeoutSeconds: 60, dailyLimit: 50 }) }
    )

    expect(plan).toEqual({
      data: { set: legalSet({ description: 'New', timeoutSeconds: 60, dailyLimit: 50 }) },
      change: 'Set description; Timeout 30 → 60; Daily limit 0 → 50',
      set: null,
    })
  })

  it('ignores the key order of the stored data', () => {
    const reordered = JSON.parse(JSON.stringify(parseLegal().value), (_key, value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value
      return Object.fromEntries(Object.entries(value).reverse())
    })

    expect(planJevSave({ rev: 3, data: reordered }, parseLegal().value)).toBeNull()
  })

  it('describes the Jev calls switch', () => {
    expect(planJevSave({ rev: 1, data: { enabled: false } }, { enabled: true })).toEqual({
      data: { enabled: true },
      change: 'Jev calls on',
      set: null,
    })
    expect(planJevSave({ rev: 2, data: { enabled: true } }, { enabled: false }).change).toBe('Jev calls off')
  })
})
