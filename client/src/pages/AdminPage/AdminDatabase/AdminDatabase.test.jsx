import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminDatabase from './AdminDatabase.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

const PRODUCTION = { id: 1, name: 'production', createdAt: '2026-10-01T10:00:00.000Z' }
const BILLING = { id: 2, name: 'billing', createdAt: '2026-10-02T10:00:00.000Z' }

function mockGet({ connections = [], maxRows = 100 } = {}) {
  return { ok: true, status: 200, json: async () => ({ connections, maxRows }) }
}

describe('AdminDatabase', () => {
  it('lists every connection by name and shows the status as configured', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ connections: [BILLING, PRODUCTION] }))

    render(<AdminDatabase token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'billing' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'production' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2)
  })

  it('shows the empty state and not configured when there is no connection', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet())

    render(<AdminDatabase token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.getByText('No database is connected yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('adds a connection, loads the list again and shows the new name', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ connection: PRODUCTION }) })
      .mockResolvedValueOnce(mockGet({ connections: [PRODUCTION] }))
    const user = userEvent.setup()

    render(<AdminDatabase token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    await user.type(screen.getByLabelText('Connection name'), 'production')
    await user.type(screen.getByLabelText('Connection string'), 'postgresql://user:pass@host/db')
    await user.click(screen.getByRole('button', { name: /add connection/i }))

    expect(await screen.findByRole('heading', { name: 'production' })).toBeInTheDocument()
    expect(screen.getByText('configured')).toBeInTheDocument()
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/postgres/connections')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ name: 'production', connectionString: 'postgresql://user:pass@host/db' })
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it('shows the current row limit and saves a new one', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ connections: [PRODUCTION], maxRows: 100 }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ maxRows: 250 }) })
    const user = userEvent.setup()

    render(<AdminDatabase token="tok" onLogout={vi.fn()} />)
    await screen.findByText('configured')

    const input = screen.getByRole('spinbutton')
    expect(input).toHaveValue(100)

    await user.clear(input)
    await user.type(input, '250')
    await user.click(screen.getByRole('button', { name: /save limit/i }))

    await waitFor(() => expect(input).toHaveValue(250))
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/postgres/max-rows')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ maxRows: 250 })
  })

  it('shows the error when the settings cannot be loaded', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Failed to read the database settings.' }),
    })

    render(<AdminDatabase token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Failed to read the database settings.')).toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminDatabase token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalledTimes(1)
    })
  })
})
