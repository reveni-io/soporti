import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GuardsTable from './GuardsTable.jsx'

const USAGE = { calls: 1200, cases: 9, sentReplies: 4 }
const LEGAL = {
  id: 'legal',
  name: 'Legal',
  description: 'Replies to customers',
  questions: 3,
  model: 'jev-1',
  usage: USAGE,
}
const GITHUB = {
  id: 'github',
  name: 'GitHub PRs',
  description: '',
  questions: 2,
  model: 'jev-1',
  usage: USAGE,
}

describe('GuardsTable', () => {
  it('lists each guard with what it is used for and its usage', () => {
    render(<GuardsTable guards={[LEGAL, GITHUB]} onEdit={vi.fn()} />)

    const [, legal, github] = screen.getAllByRole('row')
    expect(within(legal).getByRole('cell', { name: 'Legal' })).toBeInTheDocument()
    expect(legal).toHaveTextContent('Replies to customers')
    expect(within(legal).getByRole('cell', { name: (1200).toLocaleString() })).toBeInTheDocument()
    expect(github).toHaveTextContent('No description')
    expect(screen.getByText('Calls, cases and sent replies of the last 30 days.')).toBeInTheDocument()
  })

  it.each([
    ['it has no questions', { questions: 0 }, 'Not in the chat until it has questions'],
    ['it has no description', { description: '' }, 'No description'],
  ])('says what the Legal guard is used for when %s', (_case, overrides, text) => {
    render(<GuardsTable guards={[{ ...LEGAL, ...overrides }]} onEdit={vi.fn()} />)

    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('opens the guard picked to edit', async () => {
    const onEdit = vi.fn()
    const user = userEvent.setup()
    render(<GuardsTable guards={[LEGAL, GITHUB]} onEdit={onEdit} />)

    expect(screen.getByRole('button', { name: 'Edit Legal' })).toHaveTextContent('Edit')
    await user.click(screen.getByRole('button', { name: 'Edit GitHub PRs' }))

    expect(onEdit).toHaveBeenCalledWith('github')
  })
})
