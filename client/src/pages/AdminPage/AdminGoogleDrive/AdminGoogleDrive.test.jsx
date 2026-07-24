import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminGoogleDrive from './AdminGoogleDrive.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockGet({ credentialsConfigured = false, serviceAccountEmail = '' } = {}) {
  return { ok: true, status: 200, json: async () => ({ credentialsConfigured, serviceAccountEmail }) }
}

describe('AdminGoogleDrive', () => {
  it('shows not-configured status and a placeholder textarea when empty', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ credentialsConfigured: false }))

    render(<AdminGoogleDrive token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.queryByText(/@.*gserviceaccount\.com/)).not.toBeInTheDocument()
  })

  it('shows the configured service-account email but never a key', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        mockGet({ credentialsConfigured: true, serviceAccountEmail: 'sa@proj.iam.gserviceaccount.com' })
      )

    render(<AdminGoogleDrive token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.getByText('sa@proj.iam.gserviceaccount.com')).toBeInTheDocument()
  })

  it('saves a pasted credential through the PUT endpoint', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ credentialsConfigured: false }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ credentialsConfigured: true, serviceAccountEmail: 'sa@proj.iam.gserviceaccount.com' }),
      })
    const user = userEvent.setup()

    render(<AdminGoogleDrive token="tok" onLogout={vi.fn()} />)

    const textarea = await screen.findByRole('textbox')
    await user.click(textarea)
    await user.paste('{"client_email":"sa@proj.iam.gserviceaccount.com","private_key":"K"}')
    await user.click(screen.getByRole('button', { name: /save credentials/i }))

    await screen.findByText('Saved')
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/google-drive/credentials')
    expect(JSON.parse(options.body).credentials).toContain('client_email')
    expect(screen.getByText('sa@proj.iam.gserviceaccount.com')).toBeInTheDocument()
  })

  it('surfaces a validation error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ credentialsConfigured: false }))
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'The credential is missing "client_email" or "private_key".' }),
      })
    const user = userEvent.setup()

    render(<AdminGoogleDrive token="tok" onLogout={vi.fn()} />)

    const textarea = await screen.findByRole('textbox')
    await user.type(textarea, 'garbage')
    await user.click(screen.getByRole('button', { name: /save credentials/i }))

    expect(await screen.findByText(/missing "client_email"/i)).toBeInTheDocument()
  })

  it('clears the credential through Remove', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        mockGet({ credentialsConfigured: true, serviceAccountEmail: 'sa@proj.iam.gserviceaccount.com' })
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ credentialsConfigured: false, serviceAccountEmail: '' }),
      })
    const user = userEvent.setup()

    render(<AdminGoogleDrive token="tok" onLogout={vi.fn()} />)

    await screen.findByText('configured')
    await user.click(screen.getByRole('button', { name: /remove/i }))

    await waitFor(() => expect(screen.getByText('not configured')).toBeInTheDocument())
    const [, options] = global.fetch.mock.calls[1]
    expect(JSON.parse(options.body)).toEqual({ credentials: '' })
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminGoogleDrive token="expired" onLogout={onLogout} />)

    await waitFor(() => expect(onLogout).toHaveBeenCalled())
  })
})
