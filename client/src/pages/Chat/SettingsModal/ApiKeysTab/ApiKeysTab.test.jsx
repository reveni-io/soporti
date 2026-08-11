import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ApiKeysTab from './ApiKeysTab.jsx'

function jsonResponse(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function listResponse(apiKeys) {
  return jsonResponse({ apiKeys })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ApiKeysTab', () => {
  it('lists the existing keys with their prefix, scope and usage', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      listResponse([
        { id: 1, name: 'Claude Code', prefix: 'sop_abcd1234', sources: [], lastUsedAt: null },
        {
          id: 2,
          name: 'CI',
          prefix: 'sop_efgh5678',
          sources: ['integration:notion'],
          lastUsedAt: '2026-08-11T10:30:00.000Z',
        },
      ])
    )

    render(<ApiKeysTab token="tok" onLogout={vi.fn()} selectedSources={[]} />)

    expect(await screen.findByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('sop_abcd1234…')).toBeInTheDocument()
    expect(screen.getByText(/All sources · Never used/)).toBeInTheDocument()
    expect(screen.getByText(/integration:notion · Last used/)).toBeInTheDocument()
  })

  it('shows the empty state when the user has no keys', async () => {
    global.fetch = vi.fn().mockResolvedValue(listResponse([]))

    render(<ApiKeysTab token="tok" onLogout={vi.fn()} selectedSources={[]} />)

    expect(await screen.findByText('No API keys yet.')).toBeInTheDocument()
  })

  it('surfaces a load error', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'Failed to list API keys.' }, 500))

    render(<ApiKeysTab token="tok" onLogout={vi.fn()} selectedSources={[]} />)

    expect(await screen.findByText('Failed to list API keys.')).toBeInTheDocument()
  })

  it('creates an unrestricted key and shows the plaintext once', async () => {
    const user = userEvent.setup()
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce(jsonResponse({ apiKey: { id: 1, name: 'mcp' }, key: 'sop_plaintext' }, 201))
      .mockResolvedValueOnce(listResponse([{ id: 1, name: 'mcp', prefix: 'sop_plainte', sources: [] }]))

    render(<ApiKeysTab token="tok" onLogout={vi.fn()} selectedSources={['reveni-io/soporti']} />)
    await screen.findByText('No API keys yet.')

    await user.type(screen.getByRole('textbox'), 'mcp')
    await user.click(screen.getByRole('button', { name: /new api key/i }))

    expect(await screen.findByText('sop_plaintext')).toBeInTheDocument()
    expect(screen.getByText(/never shown again/i)).toBeInTheDocument()

    const [, options] = global.fetch.mock.calls[1]
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ name: 'mcp', sources: [] })
  })

  it('scopes the key to the sidebar selection when asked to', async () => {
    const user = userEvent.setup()
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce(jsonResponse({ apiKey: { id: 1, name: 'mcp' }, key: 'sop_plaintext' }, 201))
      .mockResolvedValueOnce(listResponse([]))

    render(<ApiKeysTab token="tok" onLogout={vi.fn()} selectedSources={['reveni-io/soporti', 'integration:notion']} />)
    await screen.findByText('No API keys yet.')

    await user.type(screen.getByRole('textbox'), 'mcp')
    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByText('reveni-io/soporti, integration:notion')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /new api key/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3))
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
      name: 'mcp',
      sources: ['reveni-io/soporti', 'integration:notion'],
    })
  })

  it('disables the scope checkbox when no source is selected', async () => {
    global.fetch = vi.fn().mockResolvedValue(listResponse([]))

    render(<ApiKeysTab token="tok" onLogout={vi.fn()} selectedSources={[]} />)
    await screen.findByText('No API keys yet.')

    expect(screen.getByRole('checkbox')).toBeDisabled()
  })

  it('keeps the create button disabled until a name is typed', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue(listResponse([]))

    render(<ApiKeysTab token="tok" onLogout={vi.fn()} selectedSources={[]} />)
    await screen.findByText('No API keys yet.')

    expect(screen.getByRole('button', { name: /new api key/i })).toBeDisabled()

    await user.type(screen.getByRole('textbox'), '  ')
    expect(screen.getByRole('button', { name: /new api key/i })).toBeDisabled()

    await user.type(screen.getByRole('textbox'), 'mcp')
    expect(screen.getByRole('button', { name: /new api key/i })).toBeEnabled()
  })

  it('surfaces a create error', async () => {
    const user = userEvent.setup()
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce(jsonResponse({ error: 'You can only have 20 API keys.' }, 422))

    render(<ApiKeysTab token="tok" onLogout={vi.fn()} selectedSources={[]} />)
    await screen.findByText('No API keys yet.')

    await user.type(screen.getByRole('textbox'), 'mcp')
    await user.click(screen.getByRole('button', { name: /new api key/i }))

    expect(await screen.findByText('You can only have 20 API keys.')).toBeInTheDocument()
  })

  it('copies the new key to the clipboard', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce(jsonResponse({ apiKey: { id: 1, name: 'mcp' }, key: 'sop_plaintext' }, 201))
      .mockResolvedValueOnce(listResponse([]))

    render(<ApiKeysTab token="tok" onLogout={vi.fn()} selectedSources={[]} />)
    await screen.findByText('No API keys yet.')

    await user.type(screen.getByRole('textbox'), 'mcp')
    await user.click(screen.getByRole('button', { name: /new api key/i }))
    await screen.findByText('sop_plaintext')
    await user.click(screen.getByRole('button', { name: /copy/i }))

    expect(writeText).toHaveBeenCalledWith('sop_plaintext')
  })

  it('revokes a key only after confirmation', async () => {
    const user = userEvent.setup()
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(listResponse([{ id: 3, name: 'mcp', prefix: 'sop_abcd1234', sources: [] }]))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(listResponse([]))

    render(<ApiKeysTab token="tok" onLogout={vi.fn()} selectedSources={[]} />)
    await screen.findByText('mcp')

    await user.click(screen.getByRole('button', { name: /revoke/i }))
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3))
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/api-keys/3')
    expect(options.method).toBe('DELETE')
    expect(await screen.findByText('No API keys yet.')).toBeInTheDocument()
  })

  it('cancels a pending revoke without calling the API', async () => {
    const user = userEvent.setup()
    global.fetch = vi
      .fn()
      .mockResolvedValue(listResponse([{ id: 3, name: 'mcp', prefix: 'sop_abcd1234', sources: [] }]))

    render(<ApiKeysTab token="tok" onLogout={vi.fn()} selectedSources={[]} />)
    await screen.findByText('mcp')

    await user.click(screen.getByRole('button', { name: /revoke/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.getByRole('button', { name: /revoke/i })).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('surfaces a revoke error', async () => {
    const user = userEvent.setup()
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(listResponse([{ id: 3, name: 'mcp', prefix: 'sop_abcd1234', sources: [] }]))
      .mockResolvedValueOnce(jsonResponse({ error: 'API key not found.' }, 404))

    render(<ApiKeysTab token="tok" onLogout={vi.fn()} selectedSources={[]} />)
    await screen.findByText('mcp')

    await user.click(screen.getByRole('button', { name: /revoke/i }))
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    expect(await screen.findByText('API key not found.')).toBeInTheDocument()
  })

  it('logs the user out when the API answers 401', async () => {
    const user = userEvent.setup()
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValueOnce(listResponse([])).mockResolvedValueOnce(jsonResponse({}, 401))

    render(<ApiKeysTab token="tok" onLogout={onLogout} selectedSources={[]} />)
    await screen.findByText('No API keys yet.')

    await user.type(screen.getByRole('textbox'), 'mcp')
    await user.click(screen.getByRole('button', { name: /new api key/i }))

    await waitFor(() => expect(onLogout).toHaveBeenCalled())
  })

  it('logs the user out when a revoke answers 401', async () => {
    const user = userEvent.setup()
    const onLogout = vi.fn()
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(listResponse([{ id: 3, name: 'mcp', prefix: 'sop_abcd1234', sources: [] }]))
      .mockResolvedValueOnce(jsonResponse({}, 401))

    render(<ApiKeysTab token="tok" onLogout={onLogout} selectedSources={[]} />)
    await screen.findByText('mcp')

    await user.click(screen.getByRole('button', { name: /revoke/i }))
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(onLogout).toHaveBeenCalled())
    expect(screen.queryByText(/failed to revoke/i)).not.toBeInTheDocument()
  })
})
