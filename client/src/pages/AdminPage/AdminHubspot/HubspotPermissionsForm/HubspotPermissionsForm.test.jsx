import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HubspotPermissionsForm from './HubspotPermissionsForm.jsx'
import { hubspotConfigFixture } from '../__fixtures__/hubspot-config.js'

const REPLY_WARNING = /replies go out as the hubspot user of the person who asks for them/i
const FULL_WARNING = /archiving, merging and removing associations are not available/i

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function levelOf(area, level) {
  return within(screen.getByRole('radiogroup', { name: area })).getByRole('radio', { name: level })
}

function listedScopes() {
  return within(screen.getByRole('list', { name: 'Scopes the key needs' }))
    .getAllByRole('listitem')
    .map(item => item.textContent)
}

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn()
})

describe('HubspotPermissionsForm', () => {
  it('offers one level picker per area with the saved level checked', () => {
    render(<HubspotPermissionsForm token="tok" config={hubspotConfigFixture} onLogout={vi.fn()} onSaved={vi.fn()} />)

    expect(screen.getAllByRole('radiogroup')).toHaveLength(4)
    expect(levelOf('Contacts', 'Read')).toBeChecked()
    expect(levelOf('Marketing', 'Off')).toBeChecked()
    expect(
      within(screen.getByRole('radiogroup', { name: 'Marketing' })).queryByRole('radio', { name: 'Write' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save permissions' })).toBeDisabled()
  })

  it('updates the scopes as soon as a level changes, before saving', async () => {
    const user = userEvent.setup()

    render(<HubspotPermissionsForm token="tok" config={hubspotConfigFixture} onLogout={vi.fn()} onSaved={vi.fn()} />)

    expect(listedScopes()).toEqual(hubspotConfigFixture.requiredScopes)

    await user.click(levelOf('Conversations', 'Reply'))
    await user.click(levelOf('Contacts', 'Off'))

    expect(listedScopes()).toEqual([
      'conversations.read',
      'conversations.write',
      'crm.objects.contacts.read',
      'crm.objects.owners.read',
      'sales-email-read',
    ])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('copies the scopes of the current draft', async () => {
    const user = userEvent.setup()

    render(<HubspotPermissionsForm token="tok" config={hubspotConfigFixture} onLogout={vi.fn()} onSaved={vi.fn()} />)

    await user.click(levelOf('Marketing', 'Read'))
    await user.click(screen.getByRole('button', { name: 'Copy the scopes' }))

    expect(await navigator.clipboard.readText()).toBe(
      [
        'conversations.read',
        'crm.objects.contacts.read',
        'crm.objects.owners.read',
        'marketing-email',
        'marketing.campaigns.read',
        'sales-email-read',
      ].join('\n')
    )
  })

  it('sends the whole permission map when saving', async () => {
    const saved = {
      permissions: { contacts: 'write', activities: 'read', conversations: 'read', marketing: 'off' },
      requiredScopes: ['conversations.read', 'crm.objects.contacts.write'],
    }
    global.fetch.mockResolvedValue(jsonResponse(saved))
    const onSaved = vi.fn()
    const user = userEvent.setup()

    render(<HubspotPermissionsForm token="tok" config={hubspotConfigFixture} onLogout={vi.fn()} onSaved={onSaved} />)

    await user.click(levelOf('Contacts', 'Write'))
    await user.click(screen.getByRole('button', { name: 'Save permissions' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved).toHaveBeenCalledWith(saved)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/admin/config/hubspot/permissions')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ permissions: saved.permissions })
  })

  it('warns how replies are sent while conversations are set to reply', async () => {
    const user = userEvent.setup()

    render(<HubspotPermissionsForm token="tok" config={hubspotConfigFixture} onLogout={vi.fn()} onSaved={vi.fn()} />)

    expect(screen.queryByText(REPLY_WARNING)).not.toBeInTheDocument()

    await user.click(levelOf('Conversations', 'Reply'))

    expect(screen.getByText(REPLY_WARNING)).toHaveTextContent(
      /not available from slack, over mcp, in scheduled queries or in auto-diagnoses/i
    )

    await user.click(levelOf('Conversations', 'Read'))

    expect(screen.queryByText(REPLY_WARNING)).not.toBeInTheDocument()
  })

  it('warns that full actions need somebody to confirm while any area is set to full', async () => {
    const user = userEvent.setup()

    render(<HubspotPermissionsForm token="tok" config={hubspotConfigFixture} onLogout={vi.fn()} onSaved={vi.fn()} />)

    expect(screen.queryByText(FULL_WARNING)).not.toBeInTheDocument()

    await user.click(levelOf('Activities', 'Full'))

    expect(screen.getByText(FULL_WARNING)).toHaveTextContent(
      /not available over mcp, in scheduled queries or auto-diagnoses/i
    )

    await user.click(levelOf('Activities', 'Write'))

    expect(screen.queryByText(FULL_WARNING)).not.toBeInTheDocument()
  })

  it('locks the levels while saving', async () => {
    let resolveFetch
    global.fetch.mockReturnValue(
      new Promise(resolve => {
        resolveFetch = resolve
      })
    )
    const user = userEvent.setup()

    render(<HubspotPermissionsForm token="tok" config={hubspotConfigFixture} onLogout={vi.fn()} onSaved={vi.fn()} />)

    await user.click(levelOf('Contacts', 'Write'))
    await user.click(screen.getByRole('button', { name: 'Save permissions' }))

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
    expect(levelOf('Activities', 'Full')).toBeDisabled()

    resolveFetch(jsonResponse({ permissions: hubspotConfigFixture.permissions, requiredScopes: [] }))

    await waitFor(() => expect(levelOf('Activities', 'Full')).toBeEnabled())
  })

  it('shows the error from the server and keeps the draft', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ error: 'Failed to save the HubSpot permissions.' }, 500))
    const onSaved = vi.fn()
    const user = userEvent.setup()

    render(<HubspotPermissionsForm token="tok" config={hubspotConfigFixture} onLogout={vi.fn()} onSaved={onSaved} />)

    await user.click(levelOf('Contacts', 'Write'))
    await user.click(screen.getByRole('button', { name: 'Save permissions' }))

    expect(await screen.findByText('Failed to save the HubSpot permissions.')).toBeInTheDocument()
    expect(levelOf('Contacts', 'Write')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Save permissions' })).toBeEnabled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('logs out on a 401 when saving', async () => {
    global.fetch.mockResolvedValue(jsonResponse({}, 401))
    const onLogout = vi.fn()
    const user = userEvent.setup()

    render(
      <HubspotPermissionsForm token="expired" config={hubspotConfigFixture} onLogout={onLogout} onSaved={vi.fn()} />
    )

    await user.click(levelOf('Contacts', 'Write'))
    await user.click(screen.getByRole('button', { name: 'Save permissions' }))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/failed to save/i)).not.toBeInTheDocument()
  })
})
