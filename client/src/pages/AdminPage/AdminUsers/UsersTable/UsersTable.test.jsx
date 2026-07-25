import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import UsersTable from './UsersTable.jsx'

describe('UsersTable', () => {
  it('shows a loading message instead of the table while loading', () => {
    render(<UsersTable users={[]} loading />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders a row per user with its role and sign-in methods', () => {
    render(
      <UsersTable
        loading={false}
        users={[
          {
            id: 1,
            email: 'boss@x.io',
            name: 'Boss',
            role: 'admin',
            hasGoogle: true,
            hasPassword: true,
            hasSlack: false,
            lastLoginAt: '2026-01-15T10:00:00.000Z',
          },
        ]}
      />
    )

    expect(screen.getByText('boss@x.io')).toBeInTheDocument()
    expect(screen.getByText('Boss')).toBeInTheDocument()
    expect(screen.getByText('admin')).toHaveClass('badge--success')
    expect(screen.getByText('google')).toBeInTheDocument()
    expect(screen.getByText('password')).toBeInTheDocument()
    expect(screen.queryByText('slack')).not.toBeInTheDocument()
    expect(screen.getByText(new Date('2026-01-15T10:00:00.000Z').toLocaleDateString())).toBeInTheDocument()
  })

  it('falls back to the slack id and a dash for the missing fields', () => {
    render(
      <UsersTable
        loading={false}
        users={[{ id: 2, email: '', name: '', slackId: 'U0SLACK1', role: 'user', hasSlack: true, lastLoginAt: null }]}
      />
    )

    expect(screen.getByText('U0SLACK1')).toBeInTheDocument()
    expect(screen.getByText('user')).not.toHaveClass('badge--success')
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('shows a dash when the last login is not a real date', () => {
    render(<UsersTable loading={false} users={[{ id: 3, email: 'a@x.io', role: 'user', lastLoginAt: 'nonsense' }]} />)

    expect(screen.getAllByText('—')).toHaveLength(2)
  })
})
