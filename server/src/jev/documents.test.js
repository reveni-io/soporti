import { describe, it, expect } from 'vitest'
import { defaultJevDocument, isCustomGuardId, isJevDocument, parseJevDocument, planJevSave } from './documents.js'

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
    minConfidence: 0.75,
    timeoutSeconds: 30,
    dailyLimit: 0,
    maxCharacters: 100_000,
    questions: [CHOICE, NOUL],
    ...overrides,
  }
}

function parseLegal(overrides) {
  return parseJevDocument('legal', { set: legalSet(overrides) })
}

describe('isJevDocument', () => {
  it('knows the two guards only', () => {
    expect(['github', 'legal'].every(isJevDocument)).toBe(true)
    expect(isJevDocument('jev')).toBe(false)
    expect(isJevDocument('toString')).toBe(false)
  })
})

describe('defaultJevDocument', () => {
  it('gives each guard its defaults, with no switches of its own', () => {
    expect(defaultJevDocument('legal')).toEqual({ set: expect.any(Object) })
    expect(defaultJevDocument('jev')).toBeNull()
    expect(defaultJevDocument('legal').set).toEqual({
      minConfidence: null,
      timeoutSeconds: 30,
      dailyLimit: 0,
      maxCharacters: 100_000,
      questions: [],
    })
    expect(defaultJevDocument('github')).toEqual(defaultJevDocument('legal'))
    expect(defaultJevDocument('auto-approve')).toBeNull()
  })

  it('returns a fresh copy every time', () => {
    defaultJevDocument('legal').set.questions.push(CHOICE)

    expect(defaultJevDocument('legal').set.questions).toEqual([])
  })
})

describe('parseJevDocument', () => {
  it.each(['unknown', 'toString', 'constructor'])('rejects the unknown document %s', id => {
    expect(parseJevDocument(id, {})).toEqual({ error: 'Unknown document.' })
  })

  it('normalizes a valid project set', () => {
    const { value } = parseLegal()

    expect(value.set.questions).toEqual([
      {
        id: 'q1',
        text: 'Does the change alter how money is refunded?',
        type: 'choice',
        answers: [
          { label: 'Yes', flag: true },
          { label: 'No', flag: false },
        ],
      },
      { id: 'q2', text: 'Merging this change is risky', type: 'noul', flagAt: 70 },
    ])
  })

  it('drops the model a guard used to pick, and accepts a noul question without a threshold', () => {
    const { value } = parseLegal({ model: 'jev-1.2.0', questions: [{ ...NOUL, flagAt: null }] })

    expect(value.set).not.toHaveProperty('model')
    expect(value.set.questions[0].flagAt).toBeNull()
  })

  it('drops the switches a guard no longer has, and knows no other document', () => {
    expect(parseJevDocument('legal', { enabled: true, allowSend: true, set: legalSet() }).value).toEqual({
      set: parseLegal().value.set,
    })
    expect(parseJevDocument('jev', { enabled: true })).toEqual({ error: 'Unknown document.' })
  })

  it('parses the GitHub guard like any other guard, without the repos and rules it used to keep', () => {
    expect(parseJevDocument('github', { set: legalSet({ rules: [{ id: 'ci' }] }), repos: [] }).value).toEqual({
      set: parseLegal().value.set,
    })
    expect(parseJevDocument('github', { set: legalSet({ maxCharacters: 0 }) })).toEqual({
      error: 'Max characters sent to Jev must be a positive whole number.',
    })
  })

  it.each([
    [{ minConfidence: '0.5' }, 'Min confidence must be a number from 0 to 100.'],
    [{ minConfidence: 1.5 }, 'Min confidence must be a number from 0 to 100.'],
    [{ timeoutSeconds: 0 }, 'Timeout must be a whole number of seconds.'],
    [{ dailyLimit: -1 }, 'Daily limit must be a whole number. Use 0 for no limit.'],
    [{ questions: 'none' }, 'Questions must be a list.'],
    [{ questions: Array.from({ length: 51 }, (_, i) => ({ ...NOUL, id: `q${i}` })) }, 'A set can have at most 50'],
    [{ questions: [NOUL, NOUL] }, 'Two questions have the same id.'],
    [{ questions: [{ ...NOUL, type: 'score' }] }, 'Question 1: The type must be choice or noul.'],
    [{ questions: [{ ...NOUL, type: 'constructor' }] }, 'Question 1: The type must be choice or noul.'],
    [{ questions: [{ ...NOUL, type: 'toString' }] }, 'Question 1: The type must be choice or noul.'],
    [{ questions: [{ ...NOUL, type: '__defineGetter__' }] }, 'Question 1: The type must be choice or noul.'],
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

    expect(plan.change).toBe('Created; Questions; Min confidence (empty) → 75')
    expect(plan.set).toEqual({ minConfidence: 0.75, questions: saved.set.questions })
    expect(plan.data).toBe(saved)
  })

  it('bumps the set version when a question or the min confidence change', () => {
    const questions = [{ ...CHOICE, text: 'Reworded' }, NOUL]

    expect(planJevSave({ rev: 3, data: saved }, { set: legalSet({ questions }) })).toEqual({
      data: { set: legalSet({ questions }) },
      change: 'Questions',
      set: { minConfidence: 0.75, questions },
    })
    expect(planJevSave({ rev: 3, data: saved }, { set: legalSet({ minConfidence: 0.8 }) }).set).not.toBeNull()
  })

  it('keeps the set version when only the timeout or daily limit change', () => {
    const plan = planJevSave({ rev: 3, data: saved }, { set: legalSet({ timeoutSeconds: 60, dailyLimit: 50 }) })

    expect(plan).toEqual({
      data: { set: legalSet({ timeoutSeconds: 60, dailyLimit: 50 }) },
      change: 'Timeout 30 → 60; Daily limit 0 → 50',
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

  it('lets the Legal set be emptied', () => {
    const empty = { set: legalSet({ questions: [] }) }

    expect(planJevSave({ rev: 3, data: saved }, empty).change).toBe('Questions')
  })

  it('saves a guard without a min confidence', () => {
    const empty = parseLegal({ minConfidence: null }).value

    expect(empty.set.minConfidence).toBeNull()
    expect(planJevSave({ rev: 1, data: parseLegal().value }, empty).error).toBeUndefined()
  })
})

describe('created guards', () => {
  it('know their ids, start empty and need a name', () => {
    expect(isCustomGuardId('guard-0a1b2c3d')).toBe(true)
    expect(isCustomGuardId('guard-0A1B2C3D')).toBe(false)
    expect(isJevDocument('guard-0a1b2c3d')).toBe(true)
    expect(defaultJevDocument('guard-0a1b2c3d')).toMatchObject({ name: '', set: { questions: [] } })
    expect(parseJevDocument('guard-0a1b2c3d', { name: ' Payments ', set: legalSet() }).value.name).toBe('Payments')
    expect(parseJevDocument('guard-0a1b2c3d', { set: legalSet() })).toEqual({ error: 'The name is required.' })
    expect(parseJevDocument('guard-0a1b2c3d', { name: 7, set: legalSet() })).toEqual({
      error: 'The name must be text.',
    })
  })

  it('record a new name in the change history, and let the built-in ones be renamed too', () => {
    const saved = parseJevDocument('guard-0a1b2c3d', { name: 'Payments', set: legalSet() }).value

    expect(planJevSave({ rev: 2, data: saved }, { ...saved, name: 'Refunds' }).change).toBe('Name Refunds')
    expect(parseLegal().value).not.toHaveProperty('name')
    expect(parseJevDocument('legal', { name: 'Customer replies', set: legalSet() }).value.name).toBe('Customer replies')
  })
})

describe('planJevSave for a restored version', () => {
  it('records a restored version of a guard', () => {
    const plan = planJevSave(
      { rev: 5, data: { set: legalSet() } },
      { set: legalSet({ questions: [CHOICE] }) },
      {
        restoredFrom: 2,
      }
    )

    expect(plan.change).toBe('Restored v2; Questions')
  })
})
