import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminShopify from './AdminShopify.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

const QUERY = 'SELECT domain, token FROM stores WHERE id::text = {{store}} LIMIT 1'

function mockGet({ tokenQueryConfigured = false, tokenQuery = '', databaseConfigured = true } = {}) {
  return { ok: true, status: 200, json: async () => ({ tokenQueryConfigured, tokenQuery, databaseConfigured }) }
}

describe('AdminShopify', () => {
  it('shows the status as configured and loads the stored query for editing', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ tokenQueryConfigured: true, tokenQuery: QUERY }))

    render(<AdminShopify token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue(QUERY)
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
  })

  it('shows not configured and warns when the database connection is missing', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ databaseConfigured: false }))

    render(<AdminShopify token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.getByText(/needs the Database integration/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('saves the token query', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tokenQueryConfigured: true }) })
    const user = userEvent.setup()

    render(<AdminShopify token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    fireEvent.change(screen.getByRole('textbox'), { target: { value: QUERY } })
    await user.click(screen.getByRole('button', { name: /save query/i }))

    expect(await screen.findByText('configured')).toBeInTheDocument()
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/shopify/token-query')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ tokenQuery: QUERY })
  })

  it('removes the token query', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ tokenQueryConfigured: true, tokenQuery: QUERY }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tokenQueryConfigured: false }) })
    const user = userEvent.setup()

    render(<AdminShopify token="tok" onLogout={vi.fn()} />)
    await screen.findByText('configured')

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ tokenQuery: '' })
  })

  it('surfaces a validation error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'The token query must contain the {{store}} placeholder.' }),
      })
    const user = userEvent.setup()

    render(<AdminShopify token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'SELECT domain, token FROM stores' } })
    await user.click(screen.getByRole('button', { name: /save query/i }))

    expect(await screen.findByText('The token query must contain the {{store}} placeholder.')).toBeInTheDocument()
  })

  it('drafts the query with the assistant and fills the editor without saving', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ query: QUERY }) })
    const user = userEvent.setup()

    render(<AdminShopify token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    await user.click(screen.getByRole('button', { name: /draft with soporti/i }))

    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(QUERY))
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/shopify/draft-token-query')
    expect(options.method).toBe('POST')
    expect(screen.getByRole('button', { name: /save query/i })).toBeEnabled()
    expect(screen.getByText('not configured')).toBeInTheDocument()
  })

  it('disables the draft button when the database is not configured', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ databaseConfigured: false }))

    render(<AdminShopify token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    expect(screen.getByRole('button', { name: /draft with soporti/i })).toBeDisabled()
  })

  it('surfaces a drafting error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ error: 'The assistant could not find Shopify credentials in the database.' }),
      })
    const user = userEvent.setup()

    render(<AdminShopify token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    await user.click(screen.getByRole('button', { name: /draft with soporti/i }))

    expect(
      await screen.findByText('The assistant could not find Shopify credentials in the database.')
    ).toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminShopify token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
