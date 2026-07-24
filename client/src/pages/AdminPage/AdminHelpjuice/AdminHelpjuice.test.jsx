import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminHelpjuice from './AdminHelpjuice.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockGet({ apiKeyConfigured = false, account = '' } = {}) {
  return { ok: true, status: 200, json: async () => ({ apiKeyConfigured, account }) }
}

describe('AdminHelpjuice', () => {
  it('shows configured when both the API key and the account are set', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ apiKeyConfigured: true, account: 'example' }))

    render(<AdminHelpjuice token="tok" onLogout={vi.fn()} />)

    expect(await screen.findAllByText('configured')).toHaveLength(2)
    expect(screen.getByDisplayValue('example')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
  })

  it('shows not configured when the account is missing', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ apiKeyConfigured: true, account: '' }))

    render(<AdminHelpjuice token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
  })

  it('saves the account and keeps its value visible (not a secret)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ account: 'example' }) })
    const user = userEvent.setup()

    render(<AdminHelpjuice token="tok" onLogout={vi.fn()} />)
    await screen.findByPlaceholderText('example')

    const input = screen.getByPlaceholderText('example')
    await user.type(input, 'Example')
    const saveButtons = screen.getAllByRole('button', { name: /^save$/i })
    await user.click(saveButtons[0])

    await waitFor(() => {
      expect(input).toHaveValue('example')
    })
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/helpjuice/account')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ account: 'Example' })
  })

  it('saves a new API key and clears the input (write-only)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ account: 'example' }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ apiKeyConfigured: true }) })
    const user = userEvent.setup()

    render(<AdminHelpjuice token="tok" onLogout={vi.fn()} />)
    expect(await screen.findAllByText('not configured')).toHaveLength(2)

    const input = screen.getByPlaceholderText('API key')
    await user.type(input, 'hj_newkey')
    const saveButtons = screen.getAllByRole('button', { name: /^save$/i })
    await user.click(saveButtons[1])

    expect(await screen.findAllByText('configured')).toHaveLength(2)
    expect(input).toHaveValue('')
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/helpjuice/api-key')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ apiKey: 'hj_newkey' })
  })

  it('removes the API key', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ apiKeyConfigured: true, account: 'example' }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ apiKeyConfigured: false }) })
    const user = userEvent.setup()

    render(<AdminHelpjuice token="tok" onLogout={vi.fn()} />)
    await screen.findAllByText('configured')

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(await screen.findAllByText('not configured')).toHaveLength(2)
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ apiKey: '' })
  })

  it('surfaces an account validation error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'That does not look like a valid Helpjuice account subdomain (e.g. "example").' }),
      })
    const user = userEvent.setup()

    render(<AdminHelpjuice token="tok" onLogout={vi.fn()} />)
    await screen.findByPlaceholderText('example')

    await user.type(screen.getByPlaceholderText('example'), 'bad domain')
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[0])

    expect(await screen.findByText(/valid Helpjuice account subdomain/)).toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminHelpjuice token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
