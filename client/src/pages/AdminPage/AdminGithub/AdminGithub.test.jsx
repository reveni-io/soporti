import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AdminGithub from './AdminGithub.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockGet({
  tokenConfigured = false,
  webhookSecretConfigured = false,
  repoCatalog = '',
  writesEnabled = false,
} = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      tokenConfigured,
      webhookSecretConfigured,
      repoCatalog,
      writesEnabled,
    }),
  }
}

function saveButtonOf(checkbox) {
  return within(checkbox.closest('form')).getByRole('button', { name: 'Save' })
}

describe('AdminGithub', () => {
  it('shows the token status and the stored catalog', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ tokenConfigured: true, repoCatalog: '### org/api\nBackend.' }))

    render(
      <MemoryRouter>
        <AdminGithub token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/org\/api/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Admin → Guards' })).toHaveAttribute('href', '/admin/guards')
  })

  it('turns the write access on and only saves it when its button is pressed', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ tokenConfigured: true }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ writesEnabled: true }) })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminGithub token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )

    const toggle = await screen.findByRole('checkbox', { name: /let the assistant open pull requests/i })
    expect(toggle).not.toBeChecked()

    await user.click(toggle)

    expect(toggle).toBeChecked()
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await user.click(saveButtonOf(toggle))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(2)
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toBe('/api/admin/config/github/writes')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ enabled: true })
    expect(screen.getByRole('checkbox', { name: /let the assistant open pull requests/i })).toBeChecked()
  })

  it('shows the write access already on, and lets it be turned off', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ tokenConfigured: true, writesEnabled: true }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ writesEnabled: false }) })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminGithub token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )

    const toggle = await screen.findByRole('checkbox', { name: /let the assistant open pull requests/i })
    expect(toggle).toBeChecked()

    await user.click(toggle)
    await user.click(saveButtonOf(toggle))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ enabled: false })
    expect(toggle).not.toBeChecked()
  })

  it('surfaces an error when the write access cannot be saved', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ tokenConfigured: true }))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Boom.' }) })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminGithub token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )

    const toggle = await screen.findByRole('checkbox', { name: /let the assistant open pull requests/i })
    await user.click(toggle)
    await user.click(saveButtonOf(toggle))

    expect(await screen.findByText('Boom.')).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('explains what the write access can and cannot do, and the token permissions it needs', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet())

    render(
      <MemoryRouter>
        <AdminGithub token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Write access' })).toBeInTheDocument()
    const explanation = screen.getByText(/never pushes to the default branch/i)
    expect(explanation).toHaveTextContent(/as a draft pull request/i)
    expect(explanation).toHaveTextContent('.github/')
    expect(explanation).toHaveTextContent(/never runs your code/i)
    expect(screen.getByText('Contents')).toBeInTheDocument()
    expect(screen.getByText('Pull requests: read and write')).toBeInTheDocument()
    expect(screen.getByText('workflow')).toBeInTheDocument()
    expect(screen.getByText(/off by default — reading code never needs it/i)).toBeInTheDocument()
  })

  it('lists the token permissions PR reviews need to read the CI status', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet())

    render(
      <MemoryRouter>
        <AdminGithub token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(await screen.findByText('Checks: read')).toBeInTheDocument()
    expect(screen.getByText('Commit statuses: read')).toBeInTheDocument()
    expect(screen.getByText(/reviews run without the CI section/i)).toBeInTheDocument()
  })

  it('shows not configured when there is no token', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet())

    render(
      <MemoryRouter>
        <AdminGithub token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('saves a new token and clears the input (write-only)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tokenConfigured: true }) })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminGithub token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )
    await screen.findByText('not configured')

    const input = screen.getByPlaceholderText('ghp_...')
    await user.type(input, 'ghp_newtoken')
    await user.click(screen.getByRole('button', { name: /save token/i }))

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(input).toHaveValue('')
    const [, options] = global.fetch.mock.calls[1]
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ token: 'ghp_newtoken' })
  })

  it('removes the token', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ tokenConfigured: true }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tokenConfigured: false }) })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminGithub token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )
    await screen.findByText('configured')

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ token: '' })
  })

  it('saves the catalog with a dirty-gated button', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ repoCatalog: 'old text' }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ repoCatalog: 'old text more' }) })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminGithub token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )
    await screen.findByDisplayValue('old text')

    const save = screen.getByRole('button', { name: /save catalog/i })
    expect(save).toBeDisabled()

    await user.type(screen.getByDisplayValue('old text'), ' more')
    expect(save).toBeEnabled()

    await user.click(save)

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/github/catalog')
    expect(JSON.parse(options.body)).toEqual({ catalog: 'old text more' })
  })

  it('shows the PR reviews status and the webhook payload URL', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ webhookSecretConfigured: true }))

    render(
      <MemoryRouter>
        <AdminGithub token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(await screen.findByText('enabled')).toBeInTheDocument()
    expect(screen.getByText(/\/api\/webhooks\/github/)).toBeInTheDocument()
  })

  it('generates a random secret into the input and saves it', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ webhookSecretConfigured: true }) })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminGithub token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )
    await screen.findByText('disabled')

    await user.click(screen.getByRole('button', { name: /generate/i }))
    const input = screen.getByPlaceholderText('Webhook secret')
    expect(input.value).toMatch(/^[a-f0-9]{48}$/)
    const generated = input.value

    await user.click(screen.getByRole('button', { name: /save secret/i }))

    expect(await screen.findByText('enabled')).toBeInTheDocument()
    expect(input).toHaveValue('')
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/github/webhook-secret')
    expect(JSON.parse(options.body)).toEqual({ secret: generated })
  })

  it('disables PR reviews by clearing the secret', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ webhookSecretConfigured: true }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ webhookSecretConfigured: false }) })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminGithub token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )
    await screen.findByText('enabled')

    await user.click(screen.getByRole('button', { name: /disable/i }))

    expect(await screen.findByText('disabled')).toBeInTheDocument()
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ secret: '' })
  })

  it('surfaces a token validation error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'That does not look like a valid GitHub token.' }),
      })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminGithub token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )
    await screen.findByText('not configured')

    await user.type(screen.getByPlaceholderText('ghp_...'), 'bad')
    await user.click(screen.getByRole('button', { name: /save token/i }))

    expect(await screen.findByText('That does not look like a valid GitHub token.')).toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(
      <MemoryRouter>
        <AdminGithub token="expired" onLogout={onLogout} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
