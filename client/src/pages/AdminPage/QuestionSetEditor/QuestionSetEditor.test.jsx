import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuestionSetEditor from './QuestionSetEditor.jsx'

const CHOICE = {
  id: 'q1',
  type: 'choice',
  text: 'Does the change alter how money is refunded?',
  instructions: 'Read the diff.',
  criteria: '',
  answers: [
    { label: 'Yes', criteria: 'A refund path changes.', flag: true },
    { label: 'No', criteria: '', flag: false },
  ],
}
const NOUL = {
  id: 'q2',
  type: 'noul',
  text: 'Merging this change is risky',
  instructions: '',
  criteria: '',
  flagAt: 70,
}
const SET = {
  description: 'PR risk questions',
  model: 'jev-1.14.0',
  minConfidence: 0.75,
  timeoutSeconds: 30,
  dailyLimit: 0,
  maxCharacters: 100_000,
  questions: [CHOICE, NOUL],
  rules: [],
}
const CATALOG = {
  keyConfigured: true,
  models: [
    { name: 'jev-1.14.0', description: '' },
    { name: 'jev-latest', description: 'Most recent stable release' },
  ],
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
  it('lists the questions with the answers that veto the approval', () => {
    render(<QuestionSetEditor project="github" state={editorState()} catalog={CATALOG} inUseMessage={null} />)

    expect(screen.getByText('1. Does the change alter how money is refunded?')).toBeInTheDocument()
    expect(screen.getByText('vetoes approval')).toBeInTheDocument()
    expect(screen.getByText('vetoes at 70 or more')).toBeInTheDocument()
    expect(screen.getByText('set version 9')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'jev-latest · Most recent stable release' })).toBeInTheDocument()
    expect(screen.getByLabelText('Max characters sent to Jev')).toHaveValue('100000')
  })

  it('warns about an alias and announces the next set version', () => {
    render(
      <QuestionSetEditor
        project="legal"
        state={editorState({ ...SET, model: 'jev-latest' })}
        catalog={CATALOG}
        inUseMessage={null}
      />
    )

    expect(screen.getByText(/is an alias: when it moves to a new Jev release/)).toBeInTheDocument()
    expect(screen.getByText('set version 9 → 10 on save')).toBeInTheDocument()
  })

  it('keeps the model fixed until the Jev section has a key and a saved list', () => {
    render(
      <QuestionSetEditor
        project="github"
        state={editorState()}
        catalog={{ keyConfigured: false, models: [] }}
        inUseMessage={null}
      />
    )

    expect(screen.getByRole('combobox', { name: 'Model' })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'jev-1.14.0' })).toBeInTheDocument()
    expect(screen.getByText(/which has no key saved/)).toBeInTheDocument()
  })

  it('offers a saved model that left the list', () => {
    render(
      <QuestionSetEditor
        project="github"
        state={editorState({ ...SET, model: 'jev-1.12.0' })}
        catalog={CATALOG}
        inUseMessage={null}
      />
    )

    expect(screen.getByRole('option', { name: 'jev-1.12.0 (not in the saved list)' })).toBeInTheDocument()
  })

  it('updates the set fields in the draft', async () => {
    const state = editorState()
    const user = userEvent.setup()

    render(<QuestionSetEditor project="github" state={state} catalog={CATALOG} inUseMessage={null} />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Model' }), 'jev-latest')
    expect(applyLastUpdate(state).set.model).toBe('jev-latest')

    await user.type(screen.getByLabelText('Daily limit'), '5')
    expect(applyLastUpdate(state).set.dailyLimit).toBe(5)
  })

  it('adds a question at the end of the set', async () => {
    const state = editorState()
    const user = userEvent.setup()

    render(<QuestionSetEditor project="github" state={state} catalog={CATALOG} inUseMessage={null} />)
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

    render(<QuestionSetEditor project="github" state={state} catalog={CATALOG} inUseMessage={null} />)
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1])
    expect(screen.getByText('Edit question 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1])
    await user.clear(screen.getByLabelText('Veto when the score is at least'))
    await user.click(screen.getByRole('button', { name: 'Save question' }))
    expect(applyLastUpdate(state).set.questions[1]).toEqual({ ...NOUL, flagAt: null })

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    expect(applyLastUpdate(state).set.questions).toEqual([NOUL])
  })

  it('empties the set when nothing uses it', async () => {
    const state = editorState()
    const user = userEvent.setup()

    render(<QuestionSetEditor project="legal" state={state} catalog={CATALOG} inUseMessage={null} />)
    await user.click(screen.getByRole('button', { name: 'Delete set' }))

    expect(applyLastUpdate(state).set).toMatchObject({ description: '', questions: [] })
  })

  it('explains why a set in use cannot be deleted', async () => {
    const state = editorState()
    const user = userEvent.setup()

    render(<QuestionSetEditor project="github" state={state} catalog={CATALOG} inUseMessage="Cannot delete the set." />)
    await user.click(screen.getByRole('button', { name: 'Delete set' }))

    expect(screen.getByText('Cannot delete the set.')).toBeInTheDocument()
    expect(state.updateDraft).not.toHaveBeenCalled()
  })

  it('invites to add the first question', () => {
    render(
      <QuestionSetEditor
        project="legal"
        state={editorState({ ...SET, questions: [] })}
        catalog={CATALOG}
        inUseMessage={null}
      />
    )

    expect(screen.getByText('No questions yet. Add the first one.')).toBeInTheDocument()
  })
})
