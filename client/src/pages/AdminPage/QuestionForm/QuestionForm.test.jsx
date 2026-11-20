import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuestionForm from './QuestionForm.jsx'

describe('QuestionForm', () => {
  it('builds a choice question with an answer that warns', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()

    render(<QuestionForm project="github" title="New question" question={null} onSave={onSave} onCancel={vi.fn()} />)
    await user.type(screen.getByPlaceholderText(/Does the change alter/), 'Does it touch refunds?')
    await user.type(screen.getByLabelText('Answer 1'), 'Yes')
    await user.click(screen.getAllByRole('checkbox', { name: 'Warn' })[0])
    await user.type(screen.getByLabelText('Answer 2'), 'No')
    await user.click(screen.getByRole('button', { name: 'Save question' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({
      id: expect.any(String),
      type: 'choice',
      text: 'Does it touch refunds?',
      answers: [
        { label: 'Yes', flag: true },
        { label: 'No', flag: false },
      ],
    })
    expect(screen.getByText(/A guard never blocks anything: a person has the last word/)).toBeInTheDocument()
  })

  it('adds and removes answers', async () => {
    const user = userEvent.setup()

    render(<QuestionForm project="legal" title="New question" question={null} onSave={vi.fn()} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Add answer' }))
    expect(screen.getByLabelText('Answer 3')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0])

    expect(screen.queryByLabelText('Answer 3')).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox', { name: 'Warn' })).toHaveLength(2)
  })

  it('edits a noul question with its warning threshold', async () => {
    const onSave = vi.fn()
    const question = {
      id: 'q2',
      type: 'noul',
      text: 'The reply promises a refund',
      flagAt: 60,
    }
    const user = userEvent.setup()

    render(
      <QuestionForm project="legal" title="Edit question 2" question={question} onSave={onSave} onCancel={vi.fn()} />
    )
    const threshold = screen.getByLabelText('Warn when the score is at least')
    expect(threshold).toHaveValue('60')

    await user.clear(threshold)
    await user.type(threshold, '70')
    await user.click(screen.getByRole('button', { name: 'Save question' }))

    expect(onSave).toHaveBeenCalledWith({ ...question, flagAt: 70 })
  })

  it('shows why the question cannot be saved until it is fixed', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()

    render(<QuestionForm project="github" title="New question" question={null} onSave={onSave} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Save question' }))

    expect(screen.getByText('Write the question.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()

    await user.selectOptions(screen.getByRole('combobox'), 'noul')

    expect(screen.queryByText('Write the question.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Warn when the score is at least')).toBeInTheDocument()
  })

  it('cancels without saving', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()

    render(<QuestionForm project="github" title="New question" question={null} onSave={vi.fn()} onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
