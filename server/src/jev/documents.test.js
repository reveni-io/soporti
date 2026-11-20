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
      description: '',
      model: '',
      minConfidence: null,
      timeoutSeconds: 30,
      dailyLimit: 0,
      questions: [],
    })
    expect(defaultJevDocument('github').set.maxCharacters).toBe(100_000)
    expect(defaultJevDocument('github').set.rules).toHaveLength(9)
    expect(defaultJevDocument('github').repos).toEqual([])
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

  it('drops the switches a guard no longer has, and knows no other document', () => {
    expect(parseJevDocument('legal', { enabled: true, allowSend: true, set: legalSet() }).value).toEqual({
      set: parseLegal().value.set,
    })
    expect(parseJevDocument('jev', { enabled: true })).toEqual({ error: 'Unknown document.' })
  })

  it('parses the GitHub project with its rules and repos', () => {
    const github = { set: legalSet({ maxCharacters: 50_000, rules: [{ id: 'ci', role: 'veto' }] }), repos: [] }

    expect(parseJevDocument('github', github).value).toEqual({
      set: { ...parseLegal().value.set, maxCharacters: 50_000, rules: [{ id: 'ci', role: 'veto' }] },
      repos: [],
    })
    expect(parseJevDocument('github', { set: legalSet({ rules: [] }), repos: [] })).toEqual({
      error: 'Max characters sent to Jev must be a positive whole number.',
    })
    expect(parseJevDocument('github', { set: legalSet({ maxCharacters: 1, rules: [] }), repos: 'none' })).toEqual({
      error: 'Repos must be a list.',
    })
  })

  it.each([
    [{ minConfidence: '0.5' }, 'Min confidence must be a number between 0 and 1.'],
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

describe('planJevSave for the GitHub project', () => {
  const RULES = [{ id: 'merge-risk', role: 'veto', limit: 'Low' }]

  function github({ repos = [], rules = RULES, questions = [NOUL] } = {}) {
    return { set: legalSet({ maxCharacters: 100_000, rules, questions }), repos }
  }

  it('bumps the set version when the rules change', () => {
    const plan = planJevSave(
      { rev: 2, data: github() },
      github({ rules: [{ id: 'merge-risk', role: 'veto', limit: 'Medium' }] })
    )

    expect(plan.change).toBe('Rules')
    expect(plan.set.rules).toEqual([{ id: 'merge-risk', role: 'veto', limit: 'Medium' }])
  })

  it('keeps the set version for repo changes', () => {
    const shadow = { name: 'acme/web', mode: 'shadow', jev: true, denylist: [] }
    const plan = planJevSave(
      { rev: 2, data: github({ repos: [shadow] }) },
      github({
        repos: [
          { ...shadow, mode: 'on' },
          { name: 'acme/docs', mode: 'off', jev: true, denylist: [] },
        ],
      })
    )

    expect(plan).toMatchObject({ change: 'acme/web shadow → on; Added acme/docs (off)', set: null })
  })

  it('refuses to turn on a repo that was not saved in shadow', () => {
    const repo = { name: 'acme/web', mode: 'off', jev: true, denylist: [] }

    expect(
      planJevSave({ rev: 2, data: github({ repos: [repo] }) }, github({ repos: [{ ...repo, mode: 'on' }] }))
    ).toEqual({
      error: 'Shadow first: acme/web must be saved in shadow before it can be set to on.',
    })
  })

  it('refuses to delete the set while a repo uses it', () => {
    const repo = { name: 'acme/web', mode: 'shadow', jev: true, denylist: [] }

    expect(planJevSave({ rev: 2, data: github({ repos: [repo] }) }, github({ repos: [repo], questions: [] }))).toEqual({
      error: 'Cannot delete the set: 1 auto-approve repo (acme/web) use it. Set them to off and save first.',
    })
  })

  it('records a restored version', () => {
    const plan = planJevSave({ rev: 5, data: github() }, github({ questions: [CHOICE] }), { restoredFrom: 2 })

    expect(plan.change).toBe('Restored v2; Questions')
  })
})
