import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminAuthentication from './AdminAuthentication.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockGet({ googleEnabled = false, passwordEnabled = true, domains = [], googleClientId = '' } = {}) {
  return { ok: true, status: 200, json: async () => ({ googleEnabled, passwordEnabled, domains, googleClientId }) }
}

describe('AdminAuthentication', () => {
  it('renders both toggles with the stored state', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ googleEnabled: true, passwordEnabled: false }))

    render(<AdminAuthentication token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByRole('checkbox', { name: /google sign-in/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /email & password/i })).not.toBeChecked()
  })

  it('saves a toggle change through PUT /config/auth/methods', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ googleEnabled: false, passwordEnabled: true }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ googleEnabled: true, passwordEnabled: true }),
      })
    const user = userEvent.setup()

    render(<AdminAuthentication token="tok" onLogout={vi.fn()} />)
    const googleToggle = await screen.findByRole('checkbox', { name: /google sign-in/i })

    await user.click(googleToggle)

    await waitFor(() => expect(googleToggle).toBeChecked())
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/auth/methods')
    expect(JSON.parse(options.body)).toEqual({ googleEnabled: true, passwordEnabled: true })
  })

  it('reverts the toggle when the save fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ googleEnabled: false, passwordEnabled: true }))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Failed to save' }) })
    const user = userEvent.setup()

    render(<AdminAuthentication token="tok" onLogout={vi.fn()} />)
    const googleToggle = await screen.findByRole('checkbox', { name: /google sign-in/i })

    await user.click(googleToggle)

    expect(await screen.findByText('Failed to save')).toBeInTheDocument()
    expect(googleToggle).not.toBeChecked()
  })

  it('hides the domains card while Google is disabled', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ googleEnabled: false }))

    render(<AdminAuthentication token="tok" onLogout={vi.fn()} />)

    await screen.findByRole('checkbox', { name: /google sign-in/i })
    expect(screen.queryByText('Google sign-in domains')).not.toBeInTheDocument()
  })

  it('warns that an empty domain list allows any Google account', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ googleEnabled: true, domains: [] }))

    render(<AdminAuthentication token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText(/anyone with a Google account will be able to sign in/i)).toBeInTheDocument()
  })

  it('notes the admin anti-lockout when password login is off', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ googleEnabled: true, passwordEnabled: false }))

    render(<AdminAuthentication token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText(/cannot lock yourself out/i)).toBeInTheDocument()
  })

  it('warns loudly when both methods are disabled', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ googleEnabled: false, passwordEnabled: false }))

    render(<AdminAuthentication token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText(/regular users cannot sign in at all/i)).toBeInTheDocument()
  })

  it('edits and saves the domain list', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ googleEnabled: true, domains: ['example.com'] }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ domains: ['example.com', 'example.org'] }),
      })
    const user = userEvent.setup()

    render(<AdminAuthentication token="tok" onLogout={vi.fn()} />)
    await screen.findByText('example.com')

    const domainForm = screen.getByPlaceholderText('example.com').closest('form')
    const save = within(domainForm).getByRole('button', { name: /^save$/i })
    expect(save).toBeDisabled()

    await user.type(screen.getByPlaceholderText('example.com'), 'example.org')
    await user.click(screen.getByRole('button', { name: /add/i }))
    expect(save).toBeEnabled()

    await user.click(save)

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/allowed-domains')
    expect(JSON.parse(options.body)).toEqual({ domains: ['example.com', 'example.org'] })
  })

  it('prefills the Google Client ID and saves an edit through the PUT endpoint', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ googleEnabled: true, googleClientId: 'old.apps.googleusercontent.com' }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ googleClientId: 'new.apps.googleusercontent.com' }),
      })
    const user = userEvent.setup()

    render(<AdminAuthentication token="tok" onLogout={vi.fn()} />)

    const input = await screen.findByPlaceholderText('xxxxx.apps.googleusercontent.com')
    expect(input).toHaveValue('old.apps.googleusercontent.com')

    await user.clear(input)
    await user.type(input, 'new.apps.googleusercontent.com')

    const clientIdForm = input.closest('form')
    await user.click(within(clientIdForm).getByRole('button', { name: /^save$/i }))

    await screen.findByText('Saved')
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/auth/google-client-id')
    expect(JSON.parse(options.body)).toEqual({ googleClientId: 'new.apps.googleusercontent.com' })
  })

  it('warns when Google is enabled but no client id is configured', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ googleEnabled: true, googleClientId: '' }))

    render(<AdminAuthentication token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText(/no client id is set/i)).toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminAuthentication token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
