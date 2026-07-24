import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminSentry from './AdminSentry.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockGet({ tokenConfigured = false, org = '' } = {}) {
  return { ok: true, status: 200, json: async () => ({ tokenConfigured, org }) }
}

describe('AdminSentry', () => {
  it('shows configured when both the auth token and the org are set', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ tokenConfigured: true, org: 'my-org' }))

    render(<AdminSentry token="tok" onLogout={vi.fn()} />)

    // Overall status + the auth token field status.
    expect(await screen.findAllByText('configured')).toHaveLength(2)
    expect(screen.getByDisplayValue('my-org')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
  })

  it('shows not configured when the org is missing', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ tokenConfigured: true, org: '' }))

    render(<AdminSentry token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
  })

  it('saves the org and keeps its value visible (not a secret)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ org: 'my-org' }) })
    const user = userEvent.setup()

    render(<AdminSentry token="tok" onLogout={vi.fn()} />)
    await screen.findByPlaceholderText('my-org')

    const input = screen.getByPlaceholderText('my-org')
    await user.type(input, 'My-Org')
    const saveButtons = screen.getAllByRole('button', { name: /^save$/i })
    await user.click(saveButtons[0])

    await waitFor(() => {
      expect(input).toHaveValue('my-org')
    })
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/sentry/org')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ org: 'My-Org' })
  })

  it('saves a new auth token and clears the input (write-only)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ org: 'my-org' }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tokenConfigured: true }) })
    const user = userEvent.setup()

    render(<AdminSentry token="tok" onLogout={vi.fn()} />)
    // Overall status + the auth token field status, both unconfigured.
    expect(await screen.findAllByText('not configured')).toHaveLength(2)

    const input = screen.getByPlaceholderText('Auth token')
    await user.type(input, 'sntrys_newtoken')
    const saveButtons = screen.getAllByRole('button', { name: /^save$/i })
    await user.click(saveButtons[1])

    expect(await screen.findAllByText('configured')).toHaveLength(2)
    expect(input).toHaveValue('')
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/sentry/auth-token')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ token: 'sntrys_newtoken' })
  })

  it('removes the auth token', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ tokenConfigured: true, org: 'my-org' }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tokenConfigured: false }) })
    const user = userEvent.setup()

    render(<AdminSentry token="tok" onLogout={vi.fn()} />)
    await screen.findAllByText('configured')

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(await screen.findAllByText('not configured')).toHaveLength(2)
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ token: '' })
  })

  it('surfaces an org validation error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'That does not look like a valid Sentry organization slug (e.g. "my-org").' }),
      })
    const user = userEvent.setup()

    render(<AdminSentry token="tok" onLogout={vi.fn()} />)
    await screen.findByPlaceholderText('my-org')

    await user.type(screen.getByPlaceholderText('my-org'), 'bad org')
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[0])

    expect(await screen.findByText(/valid Sentry organization slug/)).toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminSentry token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
