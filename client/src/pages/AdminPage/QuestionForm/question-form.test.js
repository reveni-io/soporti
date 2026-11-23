import { describe, it, expect } from 'vitest'
import { fromForm, toForm } from './question-form.js'

function choiceForm(overrides = {}) {
  return {
    ...toForm(null),
    text: ' Does the change alter refunds? ',
    answers: [
      { label: ' Yes ', flag: true },
      { label: 'No', flag: false },
      { label: '  ', flag: false },
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
      answers: [
        { label: '', flag: false },
        { label: '', flag: false },
      ],
      flagAt: '',
    })
  })

  it('shows the threshold of a noul question as text', () => {
    const form = toForm({ id: 'q2', type: 'noul', text: 'Risky', flagAt: 70 })

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
      answers: [
        { label: 'Yes', flag: true },
        { label: 'No', flag: false },
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
    [{ answers: [{ label: 'Yes', flag: false }] }, 'A choice question needs at least two answers.'],
    [
      {
        answers: [
          { label: 'Yes', flag: false },
          { label: 'Yes', flag: true },
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
