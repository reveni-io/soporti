import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ZendeskConnection from './ZendeskConnection.jsx'

const DISCONNECTED = { connected: false, subdomain: null, email: null, writesEnabled: false, viewId: null }
const CONNECTED = { connected: true, subdomain: 'acme', email: 'ana@acme.com', writesEnabled: false, viewId: null }
const API_TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ZendeskConnection', () => {
  it('asks for the subdomain, the agent email and the API token when not connected', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(DISCONNECTED))

    render(<ZendeskConnection token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Not connected')).toBeInTheDocument()
    expect(screen.getByLabelText(/zendesk subdomain/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/zendesk agent email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/zendesk api token/i)).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeDisabled()
    expect(screen.queryByLabelText(/zendesk view id/i)).not.toBeInTheDocument()
  })

  it('connects with the typed credentials and then offers the view and the write toggle', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(DISCONNECTED))
      .mockResolvedValueOnce(jsonResponse(CONNECTED))
    const onConnectionsChange = vi.fn()
    const user = userEvent.setup()

    render(<ZendeskConnection token="tok" onLogout={vi.fn()} onConnectionsChange={onConnectionsChange} />)
    await screen.findByText('Not connected')

    await user.type(screen.getByLabelText(/zendesk subdomain/i), 'acme')
    await user.type(screen.getByLabelText(/zendesk agent email/i), 'ana@acme.com')
    await user.type(screen.getByLabelText(/zendesk api token/i), API_TOKEN)
    await user.click(screen.getByRole('button', { name: /^connect$/i }))

    expect(await screen.findByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('acme.zendesk.com')).toBeInTheDocument()
    expect(screen.getByLabelText(/zendesk view id/i)).toHaveValue('')
    expect(screen.getByRole('checkbox', { name: /post internal notes/i })).not.toBeChecked()
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
      subdomain: 'acme',
      email: 'ana@acme.com',
      apiToken: API_TOKEN,
    })
    expect(onConnectionsChange).toHaveBeenCalledTimes(1)
  })

  it('shows the reason when the credentials are rejected and keeps what was typed', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(DISCONNECTED))
      .mockResolvedValueOnce(jsonResponse({ error: 'That does not look like a Zendesk subdomain.' }, 400))
    const user = userEvent.setup()

    render(<ZendeskConnection token="tok" onLogout={vi.fn()} />)
    await screen.findByText('Not connected')

    await user.type(screen.getByLabelText(/zendesk subdomain/i), 'not a host')
    await user.type(screen.getByLabelText(/zendesk agent email/i), 'ana@acme.com')
    await user.type(screen.getByLabelText(/zendesk api token/i), API_TOKEN)
    await user.click(screen.getByRole('button', { name: /^connect$/i }))

    expect(await screen.findByText('That does not look like a Zendesk subdomain.')).toBeInTheDocument()
    expect(screen.getByLabelText(/zendesk subdomain/i)).toHaveValue('not a host')
  })

  it('scopes the connection to a view', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(CONNECTED))
      .mockResolvedValueOnce(jsonResponse({ ...CONNECTED, viewId: '42' }))
    const user = userEvent.setup()

    render(<ZendeskConnection token="tok" onLogout={vi.fn()} />)
    await screen.findByText('Connected')

    expect(screen.getByRole('button', { name: /save view/i })).toBeDisabled()
    await user.type(screen.getByLabelText(/zendesk view id/i), '42')
    await user.click(screen.getByRole('button', { name: /save view/i }))

    expect(await screen.findByDisplayValue('42')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save view/i })).toBeDisabled()
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/user/zendesk/view')
    expect(JSON.parse(options.body)).toEqual({ viewId: '42' })
  })

  it('turns the internal notes on from the checkbox', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(CONNECTED))
      .mockResolvedValueOnce(jsonResponse({ ...CONNECTED, writesEnabled: true }))
    const user = userEvent.setup()

    render(<ZendeskConnection token="tok" onLogout={vi.fn()} />)
    await screen.findByText('Connected')

    await user.click(screen.getByRole('checkbox', { name: /post internal notes/i }))

    expect(await screen.findByRole('checkbox', { name: /post internal notes/i, checked: true })).toBeInTheDocument()
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ enabled: true })
  })

  it('disconnects and asks for the credentials again', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(CONNECTED))
      .mockResolvedValueOnce(jsonResponse(DISCONNECTED))
    const user = userEvent.setup()

    render(<ZendeskConnection token="tok" onLogout={vi.fn()} />)
    await screen.findByText('Connected')

    await user.click(screen.getByRole('button', { name: /disconnect/i }))

    expect(await screen.findByText('Not connected')).toBeInTheDocument()
    expect(screen.getByLabelText(/zendesk api token/i)).toBeInTheDocument()
    expect(global.fetch.mock.calls[1][1].method).toBe('DELETE')
  })

  it('shows an error when the connection cannot be loaded', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, 500))

    render(<ZendeskConnection token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('boom')).toBeInTheDocument()
  })
})
