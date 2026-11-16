import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DatabaseConnection from './DatabaseConnection.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

const CONNECTION = { id: 4, name: 'billing', createdAt: '2026-10-02T10:00:00.000Z' }

function ok(body = {}) {
  return { ok: true, status: 200, json: async () => body }
}

describe('DatabaseConnection', () => {
  it('shows the name and the date it was added', () => {
    render(
      <ul>
        <DatabaseConnection token="tok" connection={CONNECTION} onLogout={vi.fn()} onChanged={vi.fn()} />
      </ul>
    )

    expect(screen.getByRole('heading', { name: 'billing' })).toBeInTheDocument()
    expect(screen.getByText(/^Added /)).toBeInTheDocument()
  })

  it('renames the connection and tells the parent once', async () => {
    global.fetch = vi.fn().mockResolvedValue(ok({ connection: { ...CONNECTION, name: 'invoices' } }))
    const onChanged = vi.fn()
    const user = userEvent.setup()

    render(
      <ul>
        <DatabaseConnection token="tok" connection={CONNECTION} onLogout={vi.fn()} onChanged={onChanged} />
      </ul>
    )

    const input = screen.getByDisplayValue('billing')
    await user.clear(input)
    await user.type(input, 'invoices')
    await user.click(screen.getByRole('button', { name: 'Rename' }))

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/admin/config/postgres/connections/4')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ name: 'invoices' })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('replaces the connection string, clears the input and does not reload the list', async () => {
    global.fetch = vi.fn().mockResolvedValue(ok({ connection: CONNECTION }))
    const onChanged = vi.fn()
    const user = userEvent.setup()

    render(
      <ul>
        <DatabaseConnection token="tok" connection={CONNECTION} onLogout={vi.fn()} onChanged={onChanged} />
      </ul>
    )

    const input = screen.getByPlaceholderText('Paste a new connection string to replace it')
    await user.type(input, 'postgresql://host/new')
    await user.click(screen.getByRole('button', { name: 'Replace' }))

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ connectionString: 'postgresql://host/new' })
    expect(input).toHaveValue('')
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('asks before removing: keeping it sends nothing, confirming deletes and tells the parent', async () => {
    global.fetch = vi.fn().mockResolvedValue(ok({ deleted: true }))
    const onChanged = vi.fn()
    const user = userEvent.setup()

    render(
      <ul>
        <DatabaseConnection token="tok" connection={CONNECTION} onLogout={vi.fn()} onChanged={onChanged} />
      </ul>
    )

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByText('Remove billing? Charts that read from it stop working.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(global.fetch).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/admin/config/postgres/connections/4')
    expect(options.method).toBe('DELETE')
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('shows the server error of a failed removal and does not tell the parent', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Failed to remove the database connection.' }),
    })
    const onChanged = vi.fn()
    const user = userEvent.setup()

    render(
      <ul>
        <DatabaseConnection token="tok" connection={CONNECTION} onLogout={vi.fn()} onChanged={onChanged} />
      </ul>
    )

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByText('Failed to remove the database connection.')).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('logs out on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onLogout = vi.fn()
    const user = userEvent.setup()

    render(
      <ul>
        <DatabaseConnection token="expired" connection={CONNECTION} onLogout={onLogout} onChanged={vi.fn()} />
      </ul>
    )

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})
