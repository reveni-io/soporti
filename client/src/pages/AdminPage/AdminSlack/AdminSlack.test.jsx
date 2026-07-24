import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminSlack from './AdminSlack.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockGet({ botTokenConfigured = false, appTokenConfigured = false, signingSecretConfigured = false } = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ botTokenConfigured, appTokenConfigured, signingSecretConfigured }),
  }
}

describe('AdminSlack', () => {
  it('shows connected when both bot and app tokens are configured', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockGet({ botTokenConfigured: true, appTokenConfigured: true, signingSecretConfigured: true }))

    render(<AdminSlack token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('connected')).toBeInTheDocument()
    expect(screen.getAllByText('configured')).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(3)
  })

  it('shows not configured when nothing is set', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet())

    render(<AdminSlack token="tok" onLogout={vi.fn()} />)

    await screen.findByPlaceholderText('xoxb-...')
    expect(screen.getAllByText('not configured')).toHaveLength(4)
    expect(screen.queryByText('connected')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('saves the bot token and clears the input (write-only)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ botTokenConfigured: true }) })
    const user = userEvent.setup()

    render(<AdminSlack token="tok" onLogout={vi.fn()} />)
    await screen.findByPlaceholderText('xoxb-...')

    const input = screen.getByPlaceholderText('xoxb-...')
    await user.type(input, 'xoxb-new')
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[0])

    await waitFor(() => expect(input).toHaveValue(''))
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/slack/bot-token')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ token: 'xoxb-new' })
  })

  it('sends the secret under the "secret" key for the signing secret field', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ signingSecretConfigured: true }) })
    const user = userEvent.setup()

    render(<AdminSlack token="tok" onLogout={vi.fn()} />)
    await screen.findByPlaceholderText('xoxb-...')

    await user.type(screen.getByPlaceholderText('Signing secret'), 'sign-new')
    const saves = screen.getAllByRole('button', { name: /^save$/i })
    await user.click(saves[saves.length - 1])

    await waitFor(() => {
      const [url, options] = global.fetch.mock.calls[1]
      expect(url).toContain('/api/admin/config/slack/signing-secret')
      expect(JSON.parse(options.body)).toEqual({ secret: 'sign-new' })
    })
  })

  it('surfaces a validation error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'That does not look like a valid Slack bot token.' }),
      })
    const user = userEvent.setup()

    render(<AdminSlack token="tok" onLogout={vi.fn()} />)
    await screen.findByPlaceholderText('xoxb-...')

    await user.type(screen.getByPlaceholderText('xoxb-...'), 'bad token')
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[0])

    expect(await screen.findByText('That does not look like a valid Slack bot token.')).toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminSlack token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
