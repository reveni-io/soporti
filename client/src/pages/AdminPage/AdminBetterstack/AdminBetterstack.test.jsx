import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminBetterstack from './AdminBetterstack.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockGet({ tokenConfigured = false, host = '', username = '', passwordConfigured = false } = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ tokenConfigured, host, username, passwordConfigured }),
  }
}

const FULLY_CONFIGURED = {
  tokenConfigured: true,
  host: 'eu-nbg-2-connect.betterstackdata.com',
  username: 'u123456',
  passwordConfigured: true,
}

describe('AdminBetterstack', () => {
  it('shows configured when the token, host, username and password are all set', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet(FULLY_CONFIGURED))

    render(<AdminBetterstack token="tok" onLogout={vi.fn()} />)

    expect(await screen.findAllByText('configured')).toHaveLength(3)
    expect(screen.getByDisplayValue('eu-nbg-2-connect.betterstackdata.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('u123456')).toBeInTheDocument()
  })

  it('shows not configured when only the host is missing', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ ...FULLY_CONFIGURED, host: '' }))

    render(<AdminBetterstack token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
  })

  it('never renders a stored secret', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet(FULLY_CONFIGURED))

    render(<AdminBetterstack token="tok" onLogout={vi.fn()} />)
    await screen.findAllByText('configured')

    expect(screen.getByPlaceholderText('Paste a new token to replace it')).toHaveValue('')
    expect(screen.getByPlaceholderText('Paste a new password to replace it')).toHaveValue('')
  })

  it('saves the connect host and shows the normalized value returned by the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ host: 'eu-fsn-3-connect.betterstackdata.com' }),
      })
    const user = userEvent.setup()

    render(<AdminBetterstack token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByPlaceholderText('eu-nbg-2-connect.betterstackdata.com')

    await user.type(input, 'https://EU-FSN-3-connect.betterstackdata.com')
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[1])

    await waitFor(() => {
      expect(input).toHaveValue('eu-fsn-3-connect.betterstackdata.com')
    })
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/betterstack/connect-host')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ host: 'https://EU-FSN-3-connect.betterstackdata.com' })
  })

  it('saves the connection username', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ username: 'u123456' }) })
    const user = userEvent.setup()

    render(<AdminBetterstack token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByPlaceholderText('u123456')

    await user.type(input, 'u123456')
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[2])

    await waitFor(() => {
      expect(global.fetch.mock.calls[1][0]).toContain('/api/admin/config/betterstack/connection-username')
    })
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ username: 'u123456' })
  })

  it('saves a new api token and clears the input (write-only)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tokenConfigured: true }) })
    const user = userEvent.setup()

    render(<AdminBetterstack token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByPlaceholderText('Telemetry API token')

    await user.type(input, 'bs_newtoken')
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[0])

    await waitFor(() => {
      expect(input).toHaveValue('')
    })
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/betterstack/api-token')
    expect(JSON.parse(options.body)).toEqual({ token: 'bs_newtoken' })
  })

  it('saves a new connection password and clears the input (write-only)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ ...FULLY_CONFIGURED, passwordConfigured: false }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ passwordConfigured: true }) })
    const user = userEvent.setup()

    render(<AdminBetterstack token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByPlaceholderText('Connection password')

    await user.type(input, 'p4ssw0rd')
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[3])

    expect(await screen.findAllByText('configured')).toHaveLength(3)
    expect(input).toHaveValue('')
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/betterstack/connection-password')
    expect(JSON.parse(options.body)).toEqual({ password: 'p4ssw0rd' })
  })

  it('surfaces a host validation error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'That does not look like a valid connect host.' }),
      })
    const user = userEvent.setup()

    render(<AdminBetterstack token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByPlaceholderText('eu-nbg-2-connect.betterstackdata.com')

    await user.type(input, 'not a host')
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[1])

    expect(await screen.findByText(/valid connect host/)).toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminBetterstack token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
