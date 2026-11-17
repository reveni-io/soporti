import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GoogleConnection from './GoogleConnection.jsx'

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
]
const DISCONNECTED = { available: true, connected: false, email: null, gmail: false, calendar: false, scopes: SCOPES }
const CONNECTED = {
  available: true,
  connected: true,
  email: 'ana@acme.com',
  gmail: true,
  calendar: true,
  scopes: SCOPES,
}
const UNAVAILABLE = { available: false, connected: false, email: null, gmail: false, calendar: false, scopes: null }

const google = vi.hoisted(() => ({ options: null, respond: null }))

vi.mock('@react-oauth/google', () => ({
  useGoogleOAuth: () => ({ scriptLoadedSuccessfully: true }),
  useGoogleLogin: options => {
    google.options = options
    return () => google.respond(options)
  },
}))

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
  google.options = null
  google.respond = options => options.onSuccess({ code: 'the-code' })
})

describe('GoogleConnection', () => {
  it('offers to connect with the scopes the server asks for', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(DISCONNECTED))

    render(<GoogleConnection token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Not connected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /disconnect/i })).not.toBeInTheDocument()
    expect(google.options).toMatchObject({ flow: 'auth-code', scope: SCOPES.join(' '), select_account: false })
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/user/google')
    expect(options.headers.Authorization).toBe('Bearer tok')
  })

  it('posts the authorization code and shows the new connection', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(DISCONNECTED))
      .mockResolvedValueOnce(jsonResponse(CONNECTED))
    const onConnectionsChange = vi.fn()
    const user = userEvent.setup()

    render(<GoogleConnection token="tok" onLogout={vi.fn()} onConnectionsChange={onConnectionsChange} />)
    await user.click(await screen.findByRole('button', { name: 'Connect Google' }))

    expect(await screen.findByText('ana@acme.com')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(2)
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/user/google')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ code: 'the-code' })
    expect(onConnectionsChange).toHaveBeenCalledTimes(1)
  })

  it('shows the account and what was granted once connected', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(CONNECTED))

    render(<GoogleConnection token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('ana@acme.com')).toBeInTheDocument()
    expect(screen.getByText('Gmail')).toHaveClass('badge--success')
    expect(screen.getByText('Calendar')).toHaveClass('badge--success')
    expect(screen.getByRole('button', { name: 'Reconnect Google' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()
    expect(screen.queryByText(/keep both boxes ticked/i)).not.toBeInTheDocument()
  })

  it('points out a permission the user did not grant', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ ...CONNECTED, calendar: false }))

    render(<GoogleConnection token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Calendar not granted')).not.toHaveClass('badge--success')
    expect(screen.getByText('Gmail')).toHaveClass('badge--success')
    expect(screen.getByText(/keep both boxes ticked/i)).toBeInTheDocument()
  })

  it('reconnects through the same code flow', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ...CONNECTED, calendar: false }))
      .mockResolvedValueOnce(jsonResponse(CONNECTED))
    const user = userEvent.setup()

    render(<GoogleConnection token="tok" onLogout={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Reconnect Google' }))

    expect(await screen.findByText('Calendar')).toHaveClass('badge--success')
    expect(global.fetch.mock.calls[1][1].method).toBe('PUT')
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ code: 'the-code' })
  })

  it('disconnects and refreshes the sources', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(CONNECTED))
      .mockResolvedValueOnce(jsonResponse(DISCONNECTED))
    const onConnectionsChange = vi.fn()
    const user = userEvent.setup()

    render(<GoogleConnection token="tok" onLogout={vi.fn()} onConnectionsChange={onConnectionsChange} />)
    await user.click(await screen.findByRole('button', { name: 'Disconnect' }))

    expect(await screen.findByText('Not connected')).toBeInTheDocument()
    expect(screen.queryByText('ana@acme.com')).not.toBeInTheDocument()
    expect(global.fetch.mock.calls[1][1].method).toBe('DELETE')
    expect(onConnectionsChange).toHaveBeenCalledTimes(1)
  })

  it('explains that an admin has to add the client secret first', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(UNAVAILABLE))

    render(<GoogleConnection token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText(/admin has to add the Google client secret/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /connect google/i })).not.toBeInTheDocument()
    expect(google.options).toBeNull()
  })

  it('still lets the user disconnect after the admin removed the client secret', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ ...CONNECTED, available: false, scopes: null }))

    render(<GoogleConnection token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText(/admin has to add the Google client secret/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reconnect google/i })).not.toBeInTheDocument()
  })

  it('shows an error when Google refuses access', async () => {
    google.respond = options => options.onError({ error: 'access_denied' })
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(DISCONNECTED))
    const onConnectionsChange = vi.fn()
    const user = userEvent.setup()

    render(<GoogleConnection token="tok" onLogout={vi.fn()} onConnectionsChange={onConnectionsChange} />)
    await user.click(await screen.findByRole('button', { name: 'Connect Google' }))

    expect(await screen.findByText(/Google did not grant access/i)).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(onConnectionsChange).not.toHaveBeenCalled()
  })

  it('shows the reason when the server rejects the code', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(DISCONNECTED))
      .mockResolvedValueOnce(jsonResponse({ error: 'Google did not return access to Gmail or Calendar.' }, 422))
    const user = userEvent.setup()

    render(<GoogleConnection token="tok" onLogout={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Connect Google' }))

    expect(await screen.findByText('Google did not return access to Gmail or Calendar.')).toBeInTheDocument()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
  })

  it('calls onLogout when the load returns 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    const onLogout = vi.fn()

    render(<GoogleConnection token="tok" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalledTimes(1)
    })
  })

  it('calls onLogout when connecting returns 401', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(DISCONNECTED))
      .mockResolvedValueOnce(jsonResponse({}, 401))
    const onLogout = vi.fn()
    const user = userEvent.setup()

    render(<GoogleConnection token="tok" onLogout={onLogout} />)
    await user.click(await screen.findByRole('button', { name: 'Connect Google' }))

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalledTimes(1)
    })
  })

  it('shows an error when the load fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, 500))

    render(<GoogleConnection token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('boom')).toBeInTheDocument()
  })
})
