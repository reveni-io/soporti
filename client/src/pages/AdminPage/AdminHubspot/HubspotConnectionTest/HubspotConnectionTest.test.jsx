import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HubspotConnectionTest from './HubspotConnectionTest.jsx'

const REJECTED_KEY =
  'HubSpot rejected the key (401): it is invalid, expired or was revoked. An admin has to add a Service Key in /admin → HubSpot.'

const ACCOUNT = { portalId: 4815162, uiDomain: 'app-eu1.hubspot.com', dataHostingLocation: 'eu1' }

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('HubspotConnectionTest', () => {
  it('shows the portal and domain of the account the key reaches', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(ACCOUNT))
    const user = userEvent.setup()

    render(<HubspotConnectionTest token="tok" onLogout={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(await screen.findByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('4815162')).toBeInTheDocument()
    expect(screen.getByText('app-eu1.hubspot.com')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/admin/config/hubspot/test')
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toBe('Bearer tok')
  })

  it('shows why HubSpot refused the key', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: REJECTED_KEY }, 422))
    const user = userEvent.setup()

    render(<HubspotConnectionTest token="tok" onLogout={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(await screen.findByText(REJECTED_KEY)).toBeInTheDocument()
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
  })

  it('drops the previous account when a new test fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(ACCOUNT))
      .mockResolvedValueOnce(jsonResponse({ error: REJECTED_KEY }, 422))
    const user = userEvent.setup()

    render(<HubspotConnectionTest token="tok" onLogout={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    await screen.findByText('4815162')

    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(await screen.findByText(REJECTED_KEY)).toBeInTheDocument()
    expect(screen.queryByText('4815162')).not.toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('disables the button while the test runs', async () => {
    let resolveFetch
    global.fetch = vi.fn().mockReturnValue(
      new Promise(resolve => {
        resolveFetch = resolve
      })
    )
    const user = userEvent.setup()

    render(<HubspotConnectionTest token="tok" onLogout={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(screen.getByRole('button', { name: 'Testing...' })).toBeDisabled()

    resolveFetch(jsonResponse(ACCOUNT))

    expect(await screen.findByRole('button', { name: 'Test connection' })).toBeEnabled()
  })

  it('logs out on a 401 instead of showing an error', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'Invalid or expired token.' }, 401))
    const user = userEvent.setup()

    render(<HubspotConnectionTest token="expired" onLogout={onLogout} />)
    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Invalid or expired token.')).not.toBeInTheDocument()
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
  })
})
