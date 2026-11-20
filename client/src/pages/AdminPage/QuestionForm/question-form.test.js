import { describe, it, expect } from 'vitest'
import { fromForm, toForm } from './question-form.js'

function choiceForm(overrides = {}) {
  return {
    ...toForm(null),
    text: ' Does the change alter refunds? ',
    answers: [
      { label: ' Yes ', criteria: ' A refund path changes. ', flag: true },
      { label: 'No', criteria: '', flag: false },
      { label: '  ', criteria: 'ignored', flag: false },
    ],
    ...overrides,
  }
}

describe('toForm', () => {
  it('starts a new question as a choice with two empty answers', () => {
    expect(toForm(null)).toEqual({
      id: '',
      type: 'choice',
      text: '',
      instructions: '',
      criteria: '',
      answers: [
        { label: '', criteria: '', flag: false },
        { label: '', criteria: '', flag: false },
      ],
      flagAt: '',
    })
  })

  it('shows the threshold of a noul question as text', () => {
    const form = toForm({ id: 'q2', type: 'noul', text: 'Risky', instructions: '', criteria: '', flagAt: 70 })

    expect(form.flagAt).toBe('70')
    expect(form.answers).toHaveLength(2)
  })
})

describe('fromForm', () => {
  it('trims a choice question, drops empty answers and gives a new question an id', () => {
    const { value } = fromForm(choiceForm())

    expect(value).toEqual({
      id: expect.any(String),
      type: 'choice',
      text: 'Does the change alter refunds?',
      instructions: '',
      criteria: '',
      answers: [
        { label: 'Yes', criteria: 'A refund path changes.', flag: true },
        { label: 'No', criteria: '', flag: false },
      ],
    })
    expect(value.id).not.toBe('')
  })

  it('keeps the id of an edited question', () => {
    expect(fromForm(choiceForm({ id: 'q1' })).value.id).toBe('q1')
  })

  it('reads a noul threshold, or none', () => {
    expect(fromForm(choiceForm({ type: 'noul', flagAt: ' 60 ' })).value).toMatchObject({ type: 'noul', flagAt: 60 })
    expect(fromForm(choiceForm({ type: 'noul', flagAt: '' })).value.flagAt).toBeNull()
  })

  it.each([
    [{ text: '  ' }, 'Write the question.'],
    [{ answers: [{ label: 'Yes', criteria: '', flag: false }] }, 'A choice question needs at least two answers.'],
    [
      {
        answers: [
          { label: 'Yes', criteria: '', flag: false },
          { label: 'Yes', criteria: '', flag: true },
        ],
      },
      'Two answers have the same text.',
    ],
    [{ type: 'noul', flagAt: '101' }, 'The score threshold must be a whole number from 0 to 100.'],
    [{ type: 'noul', flagAt: '6.5' }, 'The score threshold must be a whole number from 0 to 100.'],
  ])('rejects %j', (overrides, error) => {
    expect(fromForm(choiceForm(overrides))).toEqual({ error })
  })
})
