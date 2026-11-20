import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReviewRules from './ReviewRules.jsx'

const RULES = [
  { id: 'ci', role: 'veto' },
  { id: 'review-effort', role: 'veto', limit: 10 },
  { id: 'denylist', role: 'veto' },
]
const REPOS = [{ name: 'acme/web', mode: 'shadow', jev: true, denylist: ['src/payments/**'] }]

function rulesState(rules = RULES) {
  return { draft: { set: { rules }, repos: REPOS }, updateDraft: vi.fn() }
}

function lastDraft(state) {
  return state.updateDraft.mock.calls.at(-1)[0](state.draft)
}

describe('ReviewRules', () => {
  it('lists the rules with their role, limit and what they check', () => {
    render(<ReviewRules state={rulesState()} />)

    expect(screen.getByText('CI status')).toHaveClass('review-rules__name')
    expect(screen.getByRole('combobox', { name: 'Limit of Max review effort' })).toHaveValue('10')
    expect(screen.getByText(/The estimated review time is at most the limit\./)).toBeInTheDocument()
    expect(screen.getByDisplayValue('src/payments/**')).toBeInTheDocument()
  })

  it('edits the role and the limit of a rule', async () => {
    const state = rulesState()
    const user = userEvent.setup()

    render(<ReviewRules state={state} />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Role of CI status' }), 'info')
    expect(lastDraft(state).set.rules[0]).toEqual({ id: 'ci', role: 'info' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Limit of Max review effort' }), '20')
    expect(lastDraft(state).set.rules[1]).toEqual({ id: 'review-effort', role: 'veto', limit: 20 })
  })

  it('removes a rule and adds a missing one with its first limit', async () => {
    const state = rulesState()
    const user = userEvent.setup()

    render(<ReviewRules state={state} />)
    await user.click(screen.getByRole('button', { name: 'Remove CI status' }))
    expect(lastDraft(state).set.rules.map(rule => rule.id)).toEqual(['review-effort', 'denylist'])

    await user.selectOptions(screen.getByRole('combobox', { name: 'Rule to add' }), 'nitpicks')
    await user.click(screen.getByRole('button', { name: 'Add rule' }))
    expect(lastDraft(state).set.rules.at(-1)).toEqual({ id: 'nitpicks', role: 'veto', limit: 0 })
  })

  it('adds the first missing rule by default', async () => {
    const state = rulesState()
    const user = userEvent.setup()

    render(<ReviewRules state={state} />)
    await user.click(screen.getByRole('button', { name: 'Add rule' }))

    expect(lastDraft(state).set.rules.at(-1)).toEqual({ id: 'findings', role: 'veto' })
  })

  it('edits the denylist of a repo, one pattern per line', async () => {
    const state = rulesState()
    const user = userEvent.setup()

    render(<ReviewRules state={state} />)
    await user.type(screen.getByDisplayValue('src/payments/**'), '{Enter}')

    expect(lastDraft(state).repos[0].denylist).toEqual(['src/payments/**', ''])
  })

  it('warns that the denylists are not checked without the Denylist rule', () => {
    render(<ReviewRules state={rulesState([{ id: 'ci', role: 'veto' }])} />)

    expect(screen.getByText('The Denylist rule is removed: these lists are not checked.')).toBeInTheDocument()
  })
})
