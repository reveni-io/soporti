import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateUserForm from './CreateUserForm.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('CreateUserForm', () => {
  it('creates the user with the trimmed fields, resets and reloads the list', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({}) })
    const onCreated = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<CreateUserForm token="tok" onLogout={vi.fn()} onCreated={onCreated} />)

    await user.type(screen.getByPlaceholderText('Email'), '  new@x.io  ')
    await user.type(screen.getByPlaceholderText('Name (optional)'), '  New Person  ')
    await user.type(screen.getByPlaceholderText(/^Password/), 'secret-password')
    await user.selectOptions(screen.getByLabelText('Role'), 'admin')
    await user.click(screen.getByRole('button', { name: /create/i }))

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/admin/users')
    expect(JSON.parse(options.body)).toEqual({
      email: 'new@x.io',
      password: 'secret-password',
      name: 'New Person',
      role: 'admin',
    })
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(screen.getByPlaceholderText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Role')).toHaveValue('user')
  })

  it('omits an empty name', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({}) })
    const user = userEvent.setup()

    render(<CreateUserForm token="tok" onLogout={vi.fn()} onCreated={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('Email'), 'new@x.io')
    await user.type(screen.getByPlaceholderText(/^Password/), 'secret-password')
    await user.click(screen.getByRole('button', { name: /create/i }))

    expect(JSON.parse(global.fetch.mock.calls[0][1].body).name).toBeUndefined()
  })

  it('surfaces a duplicate-email error and keeps the input', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'A user with this email exists.' }) })
    const onCreated = vi.fn()
    const user = userEvent.setup()

    render(<CreateUserForm token="tok" onLogout={vi.fn()} onCreated={onCreated} />)

    await user.type(screen.getByPlaceholderText('Email'), 'dup@x.io')
    await user.type(screen.getByPlaceholderText(/^Password/), 'secret-password')
    await user.click(screen.getByRole('button', { name: /create/i }))

    expect(await screen.findByText('A user with this email exists.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Email')).toHaveValue('dup@x.io')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('logs out on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onLogout = vi.fn()
    const user = userEvent.setup()

    render(<CreateUserForm token="expired" onLogout={onLogout} onCreated={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('Email'), 'a@x.io')
    await user.type(screen.getByPlaceholderText(/^Password/), 'secret-password')
    await user.click(screen.getByRole('button', { name: /create/i }))

    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('keeps Create disabled until an email and a password are present', async () => {
    const user = userEvent.setup()

    render(<CreateUserForm token="tok" onLogout={vi.fn()} onCreated={vi.fn()} />)

    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled()

    await user.type(screen.getByPlaceholderText('Email'), 'a@x.io')
    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled()

    await user.type(screen.getByPlaceholderText(/^Password/), 'secret-password')
    expect(screen.getByRole('button', { name: /create/i })).toBeEnabled()
  })
})
