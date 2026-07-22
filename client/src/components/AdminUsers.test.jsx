import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminUsers from './AdminUsers.jsx'

const sampleUsers = [
  {
    id: 1,
    email: 'boss@x.io',
    name: 'Boss',
    role: 'admin',
    hasGoogle: true,
    hasPassword: true,
    hasSlack: false,
    lastLoginAt: '2026-07-01T10:00:00Z',
  },
  {
    id: 2,
    email: null,
    name: null,
    slackId: 'U0SLACK1',
    role: 'user',
    hasGoogle: false,
    hasPassword: false,
    hasSlack: true,
    lastLoginAt: null,
  },
]

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AdminUsers', () => {
  it('lists users with role and sign-in method badges', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ users: sampleUsers }),
    })

    render(<AdminUsers token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('boss@x.io')).toBeInTheDocument()
    expect(screen.getByText('google')).toBeInTheDocument()
    expect(screen.getByText('password')).toBeInTheDocument()
    expect(screen.getByText('slack')).toBeInTheDocument()
    // 'admin' also appears in the role <select>; assert on the table badge.
    const adminBadges = screen.getAllByText('admin')
    expect(adminBadges.some(el => el.className.includes('badge--success'))).toBe(true)
    // Slack-only user has no email/name, so the slackId stands in for the name.
    expect(screen.getByText('U0SLACK1')).toBeInTheDocument()
  })

  it('creates a user and reloads the list', async () => {
    const listResponse = { ok: true, status: 200, json: async () => ({ users: sampleUsers }) }
    const createResponse = {
      ok: true,
      status: 201,
      json: async () => ({ user: { id: 3, email: 'new@x.io', name: null, role: 'user' } }),
    }
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(listResponse)
      .mockResolvedValueOnce(createResponse)
      .mockResolvedValueOnce(listResponse)
    const user = userEvent.setup()

    render(<AdminUsers token="tok" onLogout={vi.fn()} />)
    await screen.findByText('boss@x.io')

    await user.type(screen.getByPlaceholderText('Email'), 'new@x.io')
    await user.type(screen.getByPlaceholderText(/^Password/), 'secret-password')
    await user.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3)
    })
    const [, options] = global.fetch.mock.calls[1]
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      email: 'new@x.io',
      password: 'secret-password',
      name: undefined,
      role: 'user',
    })
  })

  it('surfaces a 409 duplicate-email error', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ users: [] }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'A user with this email already exists.' }),
      })
    const user = userEvent.setup()

    render(<AdminUsers token="tok" onLogout={vi.fn()} />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    await user.type(screen.getByPlaceholderText('Email'), 'dup@x.io')
    await user.type(screen.getByPlaceholderText(/^Password/), 'secret-password')
    await user.click(screen.getByRole('button', { name: /create/i }))

    expect(await screen.findByText('A user with this email already exists.')).toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminUsers token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
