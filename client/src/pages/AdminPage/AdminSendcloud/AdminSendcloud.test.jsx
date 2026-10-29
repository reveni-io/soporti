import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminSendcloud from './AdminSendcloud.jsx'

const ACCOUNT = { id: 1, name: 'Acme EU', createdAt: '2026-10-01T10:00:00.000Z' }

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AdminSendcloud', () => {
  it('shows not configured and an empty list when no account is linked', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ accounts: [] }))

    render(<AdminSendcloud token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.getByText('No Sendcloud account is linked yet.')).toBeInTheDocument()
    expect(global.fetch.mock.calls[0][0]).toContain('/api/admin/config/sendcloud')
  })

  it('shows configured and the linked accounts', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ accounts: [ACCOUNT] }))

    render(<AdminSendcloud token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.getByText('Acme EU')).toBeInTheDocument()
  })

  it('reloads the list after linking an account', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ accounts: [] }))
      .mockResolvedValueOnce(jsonResponse({ account: ACCOUNT }, 201))
      .mockResolvedValueOnce(jsonResponse({ accounts: [ACCOUNT] }))
    const user = userEvent.setup()

    render(<AdminSendcloud token="tok" onLogout={vi.fn()} />)
    await screen.findByText('No Sendcloud account is linked yet.')

    await user.type(screen.getByLabelText('Account name'), 'Acme EU')
    await user.type(screen.getByLabelText('Public key'), 'public-key-123')
    await user.type(screen.getByLabelText('Secret key'), 'secret-key-456')
    await user.click(screen.getByRole('button', { name: /link account/i }))

    expect(await screen.findByRole('button', { name: 'Remove Acme EU' })).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it('shows the error when the accounts cannot be loaded', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'Failed to load the Sendcloud accounts.' }, 500))

    render(<AdminSendcloud token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Failed to load the Sendcloud accounts.')).toBeInTheDocument()
  })

  it('logs out on a 401 instead of showing an error', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    const onLogout = vi.fn()

    render(<AdminSendcloud token="expired" onLogout={onLogout} />)

    await vi.waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
