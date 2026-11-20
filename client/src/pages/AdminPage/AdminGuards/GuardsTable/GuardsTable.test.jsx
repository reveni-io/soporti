import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GuardsTable from './GuardsTable.jsx'

const USAGE = { calls: 1200, cases: 9, sentReplies: 4 }
const GUARDS = [
  {
    id: 'legal',
    name: 'Legal',
    builtIn: true,
    description: 'Replies to customers',
    questions: 3,
    model: 'jev-1',
    usage: USAGE,
  },
  { id: 'github', name: 'GitHub PRs', builtIn: true, description: '', questions: 2, model: 'jev-1', usage: USAGE },
  { id: 'guard-0a1b2c3d', name: 'Refunds', builtIn: false, description: '', questions: 0, model: '', usage: USAGE },
  {
    id: 'guard-9f8e7d6c',
    name: 'Payments',
    builtIn: false,
    description: '',
    questions: 1,
    model: 'jev-1',
    usage: USAGE,
  },
]

describe('GuardsTable', () => {
  it('lists each guard with what it is used for and its usage', () => {
    render(<GuardsTable guards={GUARDS} selectedId="legal" onSelect={vi.fn()} />)

    const [, legal, github, refunds, payments] = screen.getAllByRole('row')
    expect(legal).toHaveTextContent('Legal built-in')
    expect(legal).toHaveTextContent('Replies to customers')
    expect(within(legal).getByRole('cell', { name: (1200).toLocaleString() })).toBeInTheDocument()
    expect(github).toHaveTextContent('PR reviews of the auto-approve repos')
    expect(refunds).toHaveTextContent('Not in the chat until it has questions and a model')
    expect(payments).toHaveTextContent('No description')
    expect(within(refunds).queryByText('built-in')).not.toBeInTheDocument()
  })

  it('edits one guard at a time', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<GuardsTable guards={GUARDS} selectedId="legal" onSelect={onSelect} />)

    expect(screen.getByRole('button', { name: 'Edit Legal' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Edit Refunds' }))

    expect(onSelect).toHaveBeenCalledWith('guard-0a1b2c3d')
  })
})
