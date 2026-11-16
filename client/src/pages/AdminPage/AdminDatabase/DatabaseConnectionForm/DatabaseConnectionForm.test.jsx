import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DatabaseConnectionForm from './DatabaseConnectionForm.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('DatabaseConnectionForm', () => {
  it('keeps the button disabled until both fields are filled', async () => {
    const user = userEvent.setup()

    render(<DatabaseConnectionForm token="tok" onLogout={vi.fn()} onAdded={vi.fn()} />)
    expect(screen.getByRole('button', { name: /add connection/i })).toBeDisabled()

    await user.type(screen.getByLabelText('Connection name'), 'production')
    expect(screen.getByRole('button', { name: /add connection/i })).toBeDisabled()

    await user.type(screen.getByLabelText('Connection string'), 'postgresql://host/db')
    expect(screen.getByRole('button', { name: /add connection/i })).toBeEnabled()
  })

  it('submits the trimmed values, clears both fields and tells the parent', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ connection: { id: 1 } }) })
    const onAdded = vi.fn()
    const user = userEvent.setup()

    render(<DatabaseConnectionForm token="tok" onLogout={vi.fn()} onAdded={onAdded} />)

    await user.type(screen.getByLabelText('Connection name'), '  billing  ')
    await user.type(screen.getByLabelText('Connection string'), ' postgresql://host/billing ')
    await user.click(screen.getByRole('button', { name: /add connection/i }))

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/admin/config/postgres/connections')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ name: 'billing', connectionString: 'postgresql://host/billing' })
    expect(onAdded).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Connection name')).toHaveValue('')
    expect(screen.getByLabelText('Connection string')).toHaveValue('')
  })

  it('shows the message of a duplicate name and keeps what was typed', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'A database with this name is already connected.' }),
    })
    const onAdded = vi.fn()
    const user = userEvent.setup()

    render(<DatabaseConnectionForm token="tok" onLogout={vi.fn()} onAdded={onAdded} />)

    await user.type(screen.getByLabelText('Connection name'), 'Billing')
    await user.type(screen.getByLabelText('Connection string'), 'postgresql://host/billing')
    await user.click(screen.getByRole('button', { name: /add connection/i }))

    expect(await screen.findByText('A database with this name is already connected.')).toBeInTheDocument()
    expect(screen.getByLabelText('Connection name')).toHaveValue('Billing')
    expect(onAdded).not.toHaveBeenCalled()
  })

  it('logs out on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onLogout = vi.fn()
    const user = userEvent.setup()

    render(<DatabaseConnectionForm token="expired" onLogout={onLogout} onAdded={vi.fn()} />)

    await user.type(screen.getByLabelText('Connection name'), 'billing')
    await user.type(screen.getByLabelText('Connection string'), 'postgresql://host/billing')
    await user.click(screen.getByRole('button', { name: /add connection/i }))

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
