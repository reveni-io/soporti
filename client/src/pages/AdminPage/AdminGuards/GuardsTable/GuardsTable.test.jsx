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
const GITHUB = { id: 'github', name: 'GitHub PRs', description: '', questions: 2, model: 'jev-1', usage: USAGE }

describe('GuardsTable', () => {
  it('lists each guard with what it is used for and its usage', () => {
    render(<GuardsTable guards={[LEGAL, GITHUB]} selectedId="legal" onSelect={vi.fn()} />)

    const [, legal, github] = screen.getAllByRole('row')
    expect(within(legal).getByRole('cell', { name: 'Legal' })).toBeInTheDocument()
    expect(legal).toHaveTextContent('Replies to customers')
    expect(within(legal).getByRole('cell', { name: (1200).toLocaleString() })).toBeInTheDocument()
    expect(github).toHaveTextContent('PR reviews of the auto-approve repos')
    expect(screen.getByText('Calls, cases and sent replies of the last 30 days.')).toBeInTheDocument()
  })

  it('says when a guard cannot be used in the chat yet, or has no description', () => {
    const empty = { ...LEGAL, questions: 0 }
    const { unmount } = render(<GuardsTable guards={[empty]} selectedId="legal" onSelect={vi.fn()} />)

    expect(screen.getByText('Not in the chat until it has questions and a model')).toBeInTheDocument()
    unmount()

    render(<GuardsTable guards={[{ ...LEGAL, description: '' }]} selectedId="legal" onSelect={vi.fn()} />)
    expect(screen.getByText('No description')).toBeInTheDocument()
  })

  it('edits one guard at a time', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<GuardsTable guards={[LEGAL, GITHUB]} selectedId="legal" onSelect={onSelect} />)

    expect(screen.getByRole('button', { name: 'Edit Legal' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Edit GitHub PRs' }))

    expect(onSelect).toHaveBeenCalledWith('github')
  })
})
