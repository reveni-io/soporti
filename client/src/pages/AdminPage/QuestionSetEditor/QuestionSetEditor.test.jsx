import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuestionSetEditor from './QuestionSetEditor.jsx'

const CHOICE = {
  id: 'q1',
  type: 'choice',
  text: 'Does the change alter how money is refunded?',
  answers: [
    { label: 'Yes', flag: true },
    { label: 'No', flag: false },
  ],
}
const NOUL = {
  id: 'q2',
  type: 'noul',
  text: 'Merging this change is risky',
  flagAt: 70,
}
const SET = {
  minConfidence: 0.75,
  timeoutSeconds: 30,
  dailyLimit: 0,
  maxCharacters: 100_000,
  questions: [CHOICE, NOUL],
  rules: [],
}
function editorState(draftSet = SET) {
  return {
    document: { rev: 4, setVersion: 9, data: { set: SET } },
    draft: { set: draftSet, repos: [] },
    restoredFrom: null,
    updateDraft: vi.fn(),
  }
}

function applyLastUpdate(state) {
  return state.updateDraft.mock.calls.at(-1)[0](state.draft)
}

describe('QuestionSetEditor', () => {
  it('lists the questions with the answers that warn', () => {
    render(<QuestionSetEditor project="github" state={editorState()} />)

    expect(screen.getByText('1. Does the change alter how money is refunded?')).toBeInTheDocument()
    expect(screen.getByText('warns')).toBeInTheDocument()
    expect(screen.getByText('warns at 70 or more')).toBeInTheDocument()
    expect(screen.getByText('set version 9')).toBeInTheDocument()
    expect(screen.getByText(/Every guard asks Jev’s latest model/)).toBeInTheDocument()
    expect(screen.getByLabelText('Max characters sent to Jev')).toHaveValue('100000')
  })

  it('updates the set fields in the draft', async () => {
    const state = editorState()
    const user = userEvent.setup()

    render(<QuestionSetEditor project="github" state={state} />)
    await user.type(screen.getByLabelText('Min confidence'), '5')
    expect(applyLastUpdate(state).set.minConfidence).toBe(0.755)
    expect(screen.getByText('set version 9')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Daily limit'), '5')
    expect(applyLastUpdate(state).set.dailyLimit).toBe(5)
  })

  it('adds a question at the end of the set', async () => {
    const state = editorState()
    const user = userEvent.setup()

    render(<QuestionSetEditor project="github" state={state} />)
    await user.click(screen.getByRole('button', { name: 'Add question' }))
    expect(screen.getByRole('button', { name: 'Add question' })).toBeDisabled()

    await user.type(screen.getByPlaceholderText(/Does the change alter/), 'Is CI green?')
    await user.type(screen.getByLabelText('Answer 1'), 'Yes')
    await user.type(screen.getByLabelText('Answer 2'), 'No')
    await user.click(screen.getByRole('button', { name: 'Save question' }))

    const questions = applyLastUpdate(state).set.questions
    expect(questions).toHaveLength(3)
    expect(questions[2]).toMatchObject({ text: 'Is CI green?', type: 'choice' })
    expect(screen.queryByRole('button', { name: 'Save question' })).not.toBeInTheDocument()
  })

  it('edits and deletes a question in place', async () => {
    const state = editorState()
    const user = userEvent.setup()

    render(<QuestionSetEditor project="github" state={state} />)
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1])
    expect(screen.getByText('Edit question 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1])
    await user.clear(screen.getByLabelText('Warn when the score is at least'))
    await user.click(screen.getByRole('button', { name: 'Save question' }))
    expect(applyLastUpdate(state).set.questions[1]).toEqual({ ...NOUL, flagAt: null })

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    expect(applyLastUpdate(state).set.questions).toEqual([NOUL])
  })

  it('invites to add the first question', () => {
    render(<QuestionSetEditor project="legal" state={editorState({ ...SET, questions: [] })} />)

    expect(screen.getByText('No questions yet. Add the first one.')).toBeInTheDocument()
  })
})
