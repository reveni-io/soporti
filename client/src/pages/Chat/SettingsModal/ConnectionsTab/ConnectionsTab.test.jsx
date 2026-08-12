import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConnectionsTab from './ConnectionsTab.jsx'

const API_KEY = 'grn_dGVzdGtleTEyMzQ1Njc4OTA'

beforeEach(() => {
  vi.restoreAllMocks()
})

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('ConnectionsTab', () => {
  it('shows Granola as not connected when the user has no key', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ connected: false }))

    render(<ConnectionsTab token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Not connected')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /disconnect/i })).not.toBeInTheDocument()
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/user/granola')
    expect(options.headers.Authorization).toBe('Bearer tok')
  })

  it('shows Granola as connected and offers to disconnect', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ connected: true }))

    render(<ConnectionsTab token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Connected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument()
  })

  it('sends the pasted key and reports the new state', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ connected: false }))
      .mockResolvedValueOnce(jsonResponse({ connected: true }))
    const user = userEvent.setup()

    render(<ConnectionsTab token="tok" onLogout={vi.fn()} />)
    await screen.findByText('Not connected')

    const input = screen.getByLabelText(/granola api key/i)
    await user.type(input, API_KEY)
    await user.click(screen.getByRole('button', { name: /connect/i }))

    expect(await screen.findByText('Connected')).toBeInTheDocument()
    const [, options] = global.fetch.mock.calls[1]
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ apiKey: API_KEY })
    expect(screen.getByLabelText(/granola api key/i)).toHaveValue('')
  })

  it('tells the page to refresh its sources after connecting', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ connected: false }))
      .mockResolvedValueOnce(jsonResponse({ connected: true }))
    const onConnectionsChange = vi.fn()
    const user = userEvent.setup()

    render(<ConnectionsTab token="tok" onLogout={vi.fn()} onConnectionsChange={onConnectionsChange} />)
    await screen.findByText('Not connected')

    await user.type(screen.getByLabelText(/granola api key/i), API_KEY)
    await user.click(screen.getByRole('button', { name: /connect/i }))

    await screen.findByText('Connected')
    expect(onConnectionsChange).toHaveBeenCalledTimes(1)
  })

  it('does not refresh the sources when the key is rejected', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ connected: false }))
      .mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 400))
    const onConnectionsChange = vi.fn()
    const user = userEvent.setup()

    render(<ConnectionsTab token="tok" onLogout={vi.fn()} onConnectionsChange={onConnectionsChange} />)
    await screen.findByText('Not connected')

    await user.type(screen.getByLabelText(/granola api key/i), 'bad')
    await user.click(screen.getByRole('button', { name: /connect/i }))

    await screen.findByText('nope')
    expect(onConnectionsChange).not.toHaveBeenCalled()
  })

  it('disconnects by sending an empty key', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ connected: true }))
      .mockResolvedValueOnce(jsonResponse({ connected: false }))
    const user = userEvent.setup()

    render(<ConnectionsTab token="tok" onLogout={vi.fn()} />)
    await screen.findByText('Connected')

    await user.click(screen.getByRole('button', { name: /disconnect/i }))

    expect(await screen.findByText('Not connected')).toBeInTheDocument()
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ apiKey: '' })
  })

  it('shows the reason when the server rejects the key', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ connected: false }))
      .mockResolvedValueOnce(jsonResponse({ error: 'That does not look like a Granola API key.' }, 400))
    const user = userEvent.setup()

    render(<ConnectionsTab token="tok" onLogout={vi.fn()} />)
    await screen.findByText('Not connected')

    await user.type(screen.getByLabelText(/granola api key/i), 'nope')
    await user.click(screen.getByRole('button', { name: /connect/i }))

    expect(await screen.findByText(/does not look like a Granola API key/i)).toBeInTheDocument()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
  })

  it('calls onLogout when the load returns 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    const onLogout = vi.fn()

    render(<ConnectionsTab token="tok" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })

  it('shows an error when the load fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, 500))

    render(<ConnectionsTab token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('boom')).toBeInTheDocument()
  })
})
