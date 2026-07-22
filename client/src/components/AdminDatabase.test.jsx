import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminDatabase from './AdminDatabase.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockGet({ connectionConfigured = false, maxRows = 100, maxRowsCeiling = 1000 } = {}) {
  return { ok: true, status: 200, json: async () => ({ connectionConfigured, maxRows, maxRowsCeiling }) }
}

describe('AdminDatabase', () => {
  it('shows the connection status as configured', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ connectionConfigured: true }))

    render(<AdminDatabase token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
  })

  it('shows not configured when there is no connection', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet())

    render(<AdminDatabase token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('saves a new connection string and clears the input (write-only)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ connectionConfigured: true }) })
    const user = userEvent.setup()

    render(<AdminDatabase token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    const input = screen.getByPlaceholderText('postgresql://...')
    await user.type(input, 'postgresql://user:pass@host/db')
    await user.click(screen.getByRole('button', { name: /save connection/i }))

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(input).toHaveValue('')
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/postgres/connection')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ connection: 'postgresql://user:pass@host/db' })
  })

  it('removes the connection', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ connectionConfigured: true }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ connectionConfigured: false }) })
    const user = userEvent.setup()

    render(<AdminDatabase token="tok" onLogout={vi.fn()} />)
    await screen.findByText('configured')

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ connection: '' })
  })

  it('surfaces a validation error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'That does not look like a valid PostgreSQL connection string.' }),
      })
    const user = userEvent.setup()

    render(<AdminDatabase token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    await user.type(screen.getByPlaceholderText('postgresql://...'), 'bad')
    await user.click(screen.getByRole('button', { name: /save connection/i }))

    expect(await screen.findByText('That does not look like a valid PostgreSQL connection string.')).toBeInTheDocument()
  })

  it('shows the current row limit and saves a new one', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ connectionConfigured: true, maxRows: 100 }))
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

  it('surfaces a row-limit error from the server', async () => {
    // In-range value (the client-side max attribute blocks out-of-range submits
    // before they reach the server); this exercises the server-error rendering.
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ connectionConfigured: true, maxRows: 100 }))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Failed to save the row limit.' }),
      })
    const user = userEvent.setup()

    render(<AdminDatabase token="tok" onLogout={vi.fn()} />)
    await screen.findByText('configured')

    const input = screen.getByRole('spinbutton')
    await user.clear(input)
    await user.type(input, '500')
    await user.click(screen.getByRole('button', { name: /save limit/i }))

    expect(await screen.findByText('Failed to save the row limit.')).toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminDatabase token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
