import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import TopUsersTable from './TopUsersTable.jsx'

describe('TopUsersTable', () => {
  it('lists each user with what they consumed', () => {
    render(
      <TopUsersTable
        rows={[
          {
            userId: 1,
            email: 'ana@example.com',
            name: 'Ana',
            conversations: 128,
            userMessages: 940,
            runs: 210,
            failedRuns: 0,
            inputTokens: 1_200_000,
            outputTokens: 180_000,
            lastActiveAt: '2026-08-14T09:00:00.000Z',
          },
        ]}
      />
    )

    const row = screen.getAllByRole('row')[1]

    expect(within(row).getByText('ana@example.com')).toBeInTheDocument()
    expect(within(row).getByText('128')).toBeInTheDocument()
    expect(within(row).getByText('940')).toBeInTheDocument()
    expect(within(row).getByText('210')).toBeInTheDocument()
    expect(within(row).getByText('1.2M')).toBeInTheDocument()
    expect(within(row).getByText('180K')).toBeInTheDocument()
    expect(
      within(row).getByText(
        new Date('2026-08-14T09:00:00.000Z').toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
      )
    ).toBeInTheDocument()
  })

  it('falls back to the name when the user has no email, and to the id when they have neither', () => {
    render(
      <TopUsersTable
        rows={[
          { userId: 2, email: null, name: 'Slack Bob', conversations: 3, userMessages: 4, runs: 5, failedRuns: 0 },
          { userId: 42, email: null, name: null, conversations: 0, userMessages: 0, runs: 9, failedRuns: 0 },
        ]}
      />
    )

    expect(screen.getByText('Slack Bob')).toBeInTheDocument()
    expect(screen.getByText('User #42')).toBeInTheDocument()
  })

  it('badges the failed runs and dashes the row that has none', () => {
    render(
      <TopUsersTable
        rows={[
          { userId: 1, email: 'ana@example.com', conversations: 1, userMessages: 1, runs: 9, failedRuns: 2 },
          { userId: 2, email: 'bob@example.com', conversations: 1, userMessages: 1, runs: 9, failedRuns: 0 },
        ]}
      />
    )

    const [, first, second] = screen.getAllByRole('row')

    expect(within(first).getByText('2')).toBeInTheDocument()
    expect(within(second).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('says so when the breakdown could not be loaded', () => {
    render(<TopUsersTable rows={null} />)

    expect(screen.getByText('The user breakdown is unavailable right now.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows an empty state when nobody used the assistant in the range', () => {
    render(<TopUsersTable rows={[]} />)

    expect(screen.getByText('No user activity recorded yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
