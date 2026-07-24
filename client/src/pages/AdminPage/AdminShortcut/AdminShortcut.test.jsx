import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminShortcut from './AdminShortcut.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockGet({ tokenConfigured = false } = {}) {
  return { ok: true, status: 200, json: async () => ({ tokenConfigured }) }
}

describe('AdminShortcut', () => {
  it('shows the token status as configured', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ tokenConfigured: true }))

    render(<AdminShortcut token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
  })

  it('shows not configured when there is no token', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet())

    render(<AdminShortcut token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('saves a new token and clears the input (write-only)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tokenConfigured: true }) })
    const user = userEvent.setup()

    render(<AdminShortcut token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    const input = screen.getByPlaceholderText('Shortcut API token')
    await user.type(input, 'sc-newtoken')
    await user.click(screen.getByRole('button', { name: /save token/i }))

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(input).toHaveValue('')
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/shortcut/token')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ token: 'sc-newtoken' })
  })

  it('removes the token', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ tokenConfigured: true }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tokenConfigured: false }) })
    const user = userEvent.setup()

    render(<AdminShortcut token="tok" onLogout={vi.fn()} />)
    await screen.findByText('configured')

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ token: '' })
  })

  it('surfaces a token validation error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'That does not look like a valid Shortcut token.' }),
      })
    const user = userEvent.setup()

    render(<AdminShortcut token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    await user.type(screen.getByPlaceholderText('Shortcut API token'), 'bad')
    await user.click(screen.getByRole('button', { name: /save token/i }))

    expect(await screen.findByText('That does not look like a valid Shortcut token.')).toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminShortcut token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
