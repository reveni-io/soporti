import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useHubspotPermissions } from './useHubspotPermissions.js'
import { hubspotConfigFixture } from '../../__fixtures__/hubspot-config.js'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn()
})

describe('useHubspotPermissions', () => {
  it('starts from the saved levels and the scopes the server reported', () => {
    const { result } = renderHook(() =>
      useHubspotPermissions({ token: 'tok', config: hubspotConfigFixture, onLogout: vi.fn(), onSaved: vi.fn() })
    )

    expect(result.current.draft).toEqual(hubspotConfigFixture.permissions)
    expect(result.current.scopes).toEqual(hubspotConfigFixture.requiredScopes)
    expect(result.current.dirty).toBe(false)
    expect(result.current.repliesEnabled).toBe(false)
    expect(result.current.fullEnabled).toBe(false)
  })

  it('recalculates the scopes from the draft before anything is saved', () => {
    const { result } = renderHook(() =>
      useHubspotPermissions({ token: 'tok', config: hubspotConfigFixture, onLogout: vi.fn(), onSaved: vi.fn() })
    )

    act(() => result.current.setLevel('contacts', 'write'))
    act(() => result.current.setLevel('marketing', 'read'))

    expect(result.current.draft).toEqual({
      contacts: 'write',
      activities: 'read',
      conversations: 'read',
      marketing: 'read',
    })
    expect(result.current.scopes).toEqual([
      'conversations.read',
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.owners.read',
      'marketing-email',
      'marketing.campaigns.read',
      'sales-email-read',
    ])
    expect(result.current.dirty).toBe(true)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('keeps a scope another area still needs and the ones no area owns', () => {
    const { result } = renderHook(() =>
      useHubspotPermissions({ token: 'tok', config: hubspotConfigFixture, onLogout: vi.fn(), onSaved: vi.fn() })
    )

    act(() => result.current.setLevel('contacts', 'off'))

    expect(result.current.scopes).toEqual([
      'conversations.read',
      'crm.objects.contacts.read',
      'crm.objects.owners.read',
      'sales-email-read',
    ])

    act(() => result.current.setLevel('activities', 'off'))
    act(() => result.current.setLevel('conversations', 'off'))

    expect(result.current.scopes).toEqual(['crm.objects.owners.read'])
  })

  it('is clean again once a level goes back to the saved one', () => {
    const { result } = renderHook(() =>
      useHubspotPermissions({ token: 'tok', config: hubspotConfigFixture, onLogout: vi.fn(), onSaved: vi.fn() })
    )

    act(() => result.current.setLevel('contacts', 'write'))
    act(() => result.current.setLevel('contacts', 'read'))

    expect(result.current.dirty).toBe(false)
  })

  it('flags replies and full access while the draft has them', () => {
    const { result } = renderHook(() =>
      useHubspotPermissions({ token: 'tok', config: hubspotConfigFixture, onLogout: vi.fn(), onSaved: vi.fn() })
    )

    act(() => result.current.setLevel('conversations', 'reply'))
    act(() => result.current.setLevel('activities', 'full'))

    expect(result.current.repliesEnabled).toBe(true)
    expect(result.current.fullEnabled).toBe(true)

    act(() => result.current.setLevel('conversations', 'read'))
    act(() => result.current.setLevel('activities', 'write'))

    expect(result.current.repliesEnabled).toBe(false)
    expect(result.current.fullEnabled).toBe(false)
  })

  it('saves the whole draft and hands back what the server stored', async () => {
    const saved = {
      permissions: { contacts: 'write', activities: 'read', conversations: 'read', marketing: 'off' },
      requiredScopes: ['crm.objects.contacts.write'],
    }
    global.fetch.mockResolvedValue(jsonResponse(saved))
    const onSaved = vi.fn()

    const { result } = renderHook(() =>
      useHubspotPermissions({ token: 'tok', config: hubspotConfigFixture, onLogout: vi.fn(), onSaved })
    )

    act(() => result.current.setLevel('contacts', 'write'))
    await act(() => result.current.submit())

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/admin/config/hubspot/permissions')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({
      permissions: { contacts: 'write', activities: 'read', conversations: 'read', marketing: 'off' },
    })
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith(saved)
    expect(result.current.savedAt).not.toBeNull()
  })

  it('follows the stored levels again once the draft is saved', async () => {
    const stored = { contacts: 'write', activities: 'read', conversations: 'read', marketing: 'off' }
    global.fetch.mockResolvedValue(jsonResponse({ permissions: stored, requiredScopes: [] }))

    const { result, rerender } = renderHook(
      ({ config }) => useHubspotPermissions({ token: 'tok', config, onLogout: vi.fn(), onSaved: vi.fn() }),
      { initialProps: { config: hubspotConfigFixture } }
    )

    act(() => result.current.setLevel('contacts', 'write'))
    await act(() => result.current.submit())
    rerender({ config: { ...hubspotConfigFixture, permissions: { ...stored, contacts: 'full' } } })

    expect(result.current.draft.contacts).toBe('full')
    expect(result.current.dirty).toBe(false)
  })

  it('keeps the draft and reports the error when saving fails', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ error: 'Failed to save the HubSpot permissions.' }, 500))
    const onSaved = vi.fn()

    const { result } = renderHook(() =>
      useHubspotPermissions({ token: 'tok', config: hubspotConfigFixture, onLogout: vi.fn(), onSaved })
    )

    act(() => result.current.setLevel('contacts', 'write'))
    await act(() => result.current.submit())

    expect(result.current.error).toBe('Failed to save the HubSpot permissions.')
    expect(result.current.draft.contacts).toBe('write')
    expect(result.current.dirty).toBe(true)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('logs out on a 401 without reporting an error', async () => {
    global.fetch.mockResolvedValue(jsonResponse({}, 401))
    const onLogout = vi.fn()
    const onSaved = vi.fn()

    const { result } = renderHook(() =>
      useHubspotPermissions({ token: 'expired', config: hubspotConfigFixture, onLogout, onSaved })
    )

    act(() => result.current.setLevel('contacts', 'write'))
    await act(() => result.current.submit())

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
    expect(onSaved).not.toHaveBeenCalled()
  })
})
