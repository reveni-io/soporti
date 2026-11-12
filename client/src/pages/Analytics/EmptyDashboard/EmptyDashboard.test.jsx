import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmptyDashboard from './EmptyDashboard.jsx'

describe('EmptyDashboard', () => {
  it('invites the first question over a ghost dashboard that assistive technology skips', () => {
    const { container } = render(<EmptyDashboard onPickExample={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Your dashboard starts with a question.' })).toBeInTheDocument()
    expect(screen.getByText(/Soporti explores the database, writes the SQL and draws it/)).toBeInTheDocument()
    expect(container.querySelectorAll('.empty-dashboard__tile')).toHaveLength(3)
    expect(container.querySelector('.empty-dashboard__ghost')).toHaveAttribute('aria-hidden', 'true')
  })

  it('offers the four example prompts', () => {
    render(<EmptyDashboard onPickExample={vi.fn()} />)

    expect(screen.getAllByRole('button').map(example => example.textContent)).toEqual([
      'Orders per week over the last 3 months',
      'Top 10 customers by revenue this year',
      'Signups per day this month, by plan',
      'The 10 largest tables by number of rows',
    ])
  })

  it('hands over the example that was picked', async () => {
    const onPickExample = vi.fn()
    const user = userEvent.setup()
    render(<EmptyDashboard onPickExample={onPickExample} />)

    await user.click(screen.getByRole('button', { name: 'Signups per day this month, by plan' }))

    expect(onPickExample).toHaveBeenCalledTimes(1)
    expect(onPickExample).toHaveBeenCalledWith('Signups per day this month, by plan')
  })
})
