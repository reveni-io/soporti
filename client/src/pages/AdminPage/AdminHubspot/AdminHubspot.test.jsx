import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminHubspot from './AdminHubspot.jsx'
import { hubspotConfigFixture } from './__fixtures__/hubspot-config.js'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function mockGet({ tokenConfigured = false } = {}) {
  return jsonResponse({ ...hubspotConfigFixture, tokenConfigured })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AdminHubspot', () => {
  it('shows the key status as configured', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ tokenConfigured: true }))

    render(<AdminHubspot token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeInTheDocument()
    expect(global.fetch.mock.calls[0][0]).toContain('/api/admin/config/hubspot')
  })

  it('offers no connection test until a key is saved', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet())

    render(<AdminHubspot token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Test connection' })).not.toBeInTheDocument()
  })

  it('saves a new key, clears the input and offers the connection test', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce(jsonResponse({ tokenConfigured: true }))
    const user = userEvent.setup()

    render(<AdminHubspot token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    const input = screen.getByPlaceholderText('HubSpot Service Key')
    await user.type(input, 'pat-eu1-key')
    await user.click(screen.getByRole('button', { name: 'Save key' }))

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(input).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(2)
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/hubspot/token')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ token: 'pat-eu1-key' })
  })

  it('drops the result of the last connection test once a new key is saved', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ tokenConfigured: true }))
      .mockResolvedValueOnce(jsonResponse({ portalId: 4815162, uiDomain: 'app-eu1.hubspot.com' }))
      .mockResolvedValueOnce(jsonResponse({ tokenConfigured: true }))
    const user = userEvent.setup()

    render(<AdminHubspot token="tok" onLogout={vi.fn()} />)
    await screen.findByText('configured')

    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(await screen.findByText('4815162')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Paste a new key to replace it'), 'pat-eu1-other')
    await user.click(screen.getByRole('button', { name: 'Save key' }))

    await waitFor(() => expect(screen.queryByText('4815162')).not.toBeInTheDocument())
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(3)
    expect(global.fetch.mock.calls[2][0]).toContain('/api/admin/config/hubspot/token')
  })

  it('says that only a chat asks for a yes before a change', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ tokenConfigured: true }))

    render(<AdminHubspot token="tok" onLogout={vi.fn()} />)

    expect(
      await screen.findByText(/in a chat, every change is shown first and only happens once the person says yes/i)
    ).toBeInTheDocument()
  })

  it('removes the key', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ tokenConfigured: true }))
      .mockResolvedValueOnce(jsonResponse({ tokenConfigured: false }))
    const user = userEvent.setup()

    render(<AdminHubspot token="tok" onLogout={vi.fn()} />)
    await screen.findByText('configured')

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Test connection' })).not.toBeInTheDocument()
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ token: '' })
  })

  it('surfaces a key validation error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce(
        jsonResponse({ error: 'The HubSpot key must be a single value without spaces, up to 500 characters.' }, 400)
      )
    const user = userEvent.setup()

    render(<AdminHubspot token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    await user.type(screen.getByPlaceholderText('HubSpot Service Key'), 'bad')
    await user.click(screen.getByRole('button', { name: 'Save key' }))

    expect(
      await screen.findByText('The HubSpot key must be a single value without spaces, up to 500 characters.')
    ).toBeInTheDocument()
    expect(screen.getByText('not configured')).toBeInTheDocument()
  })

  it('shows the saved permissions as current once the server stores them', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ tokenConfigured: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          permissions: { contacts: 'write', activities: 'read', conversations: 'read', marketing: 'off' },
          requiredScopes: [
            'conversations.read',
            'crm.objects.contacts.read',
            'crm.objects.contacts.write',
            'crm.objects.owners.read',
            'sales-email-read',
          ],
        })
      )
    const user = userEvent.setup()

    render(<AdminHubspot token="tok" onLogout={vi.fn()} />)
    await screen.findByText('configured')

    const contacts = screen.getByRole('radiogroup', { name: 'Contacts' })
    await user.click(within(contacts).getByRole('radio', { name: 'Write' }))
    await user.click(screen.getByRole('button', { name: 'Save permissions' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(within(contacts).getByRole('radio', { name: 'Write' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Save permissions' })).toBeDisabled()
    expect(
      within(screen.getByRole('list', { name: 'Scopes the key needs' }))
        .getAllByRole('listitem')
        .map(item => item.textContent)
    ).toEqual([
      'conversations.read',
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.owners.read',
      'sales-email-read',
    ])
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
      permissions: { contacts: 'write', activities: 'read', conversations: 'read', marketing: 'off' },
    })
  })

  it('lets the admin pick permissions before any key is saved', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet())

    render(<AdminHubspot token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    expect(screen.getByRole('radiogroup', { name: 'Contacts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy the scopes' })).toBeInTheDocument()
  })

  it('shows the error when the settings cannot be loaded', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'Failed to load the HubSpot settings.' }, 500))

    render(<AdminHubspot token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Failed to load the HubSpot settings.')).toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({}, 401))

    render(<AdminHubspot token="expired" onLogout={onLogout} />)

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
  })
})
