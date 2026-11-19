import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminJev from './AdminJev.jsx'

const BASE = '/api/admin/config/jev'
const LATEST = { name: 'jev-latest', description: 'Most recent stable release', releaseDate: '2026-10-14' }
const PREVIEW = { name: 'jev-preview', description: 'Most recent release', releaseDate: '2026-10-14' }
const SCANNED_AT = '2026-11-17T08:30:00.000Z'
const SAVED_AT = '2026-11-19T10:00:00.000Z'
const UNSAVED = { id: 'jev', rev: 0, data: { enabled: false }, setVersion: 0, savedAt: null, savedBy: null }
const NO_HISTORY = { entries: [], total: 0, page: 1, pageSize: 5 }

function okResponse(data) {
  return { ok: true, status: 200, json: async () => data }
}

function errorResponse(status, error) {
  return { ok: false, status, json: async () => ({ error }) }
}

function mockApi(routes) {
  const handlers = {
    [`GET ${BASE}`]: [okResponse({ keyConfigured: false, models: [], scannedAt: null })],
    [`GET ${BASE}/documents/jev`]: [okResponse(UNSAVED)],
    [`GET ${BASE}/documents/jev/history?page=1`]: [okResponse(NO_HISTORY)],
    ...routes,
  }
  global.fetch = vi.fn(async (url, options = {}) => {
    const responses = handlers[`${options.method ?? 'GET'} ${url}`]
    if (!responses) throw new Error(`Unexpected request: ${options.method ?? 'GET'} ${url}`)
    return responses.length > 1 ? responses.shift() : responses[0]
  })
}

function requestsTo(method, path) {
  return global.fetch.mock.calls.filter(([url, options = {}]) => url === path && (options.method ?? 'GET') === method)
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AdminJev', () => {
  it('starts without a key, without models and with Jev calls off', async () => {
    mockApi({})

    render(<AdminJev token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scan for new models' })).toBeDisabled()
    expect(screen.getByText('No models saved yet.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Allow Jev calls/ })).not.toBeChecked()
    expect(await screen.findByText('No changes yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save (v0 → v1)' })).toBeDisabled()
  })

  it('shows the saved catalog when the key is configured', async () => {
    mockApi({
      [`GET ${BASE}`]: [okResponse({ keyConfigured: true, models: [LATEST], scannedAt: SCANNED_AT })],
    })

    render(<AdminJev token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Paste a new key to replace it')).toBeInTheDocument()
    expect(screen.getByText(/^1 model saved · last scan/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scan for new models' })).toBeEnabled()
  })

  it('shows the latency of a successful connection test', async () => {
    mockApi({ [`POST ${BASE}/test`]: [okResponse({ latencyMs: 312 })] })
    const user = userEvent.setup()

    render(<AdminJev token="tok" onLogout={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Test connection' }))

    expect(await screen.findByText('Connected · 312 ms')).toBeInTheDocument()
    expect(requestsTo('POST', `${BASE}/test`)).toHaveLength(1)
  })

  it('shows why a connection test failed until a new key is saved', async () => {
    const failure = 'No API key saved. Save the key above and test again.'
    mockApi({
      [`POST ${BASE}/test`]: [errorResponse(422, failure)],
      [`PUT ${BASE}/api-key`]: [okResponse({ keyConfigured: true })],
    })
    const user = userEvent.setup()

    render(<AdminJev token="tok" onLogout={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Test connection' }))

    expect(await screen.findByText(failure)).toBeInTheDocument()
    expect(screen.queryByText(/^Connected/)).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Jev API key'), 'jev-secret')
    await user.click(screen.getByRole('button', { name: 'Save key' }))

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.queryByText(failure)).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Paste a new key to replace it')).toHaveValue('')
    const [[, options]] = requestsTo('PUT', `${BASE}/api-key`)
    expect(JSON.parse(options.body)).toEqual({ apiKey: 'jev-secret' })
    expect(requestsTo('GET', `${BASE}/documents/jev/history?page=1`)).toHaveLength(2)
  })

  it('saves the scanned models and says how many are new', async () => {
    mockApi({
      [`GET ${BASE}`]: [okResponse({ keyConfigured: true, models: [LATEST], scannedAt: SCANNED_AT })],
      [`POST ${BASE}/models/scan`]: [
        okResponse({ models: [LATEST, PREVIEW], scannedAt: SCANNED_AT, newModels: 1 }),
        okResponse({ models: [LATEST, PREVIEW], scannedAt: SCANNED_AT, newModels: 0 }),
      ],
    })
    const user = userEvent.setup()

    render(<AdminJev token="tok" onLogout={vi.fn()} />)
    const scan = await screen.findByRole('button', { name: 'Scan for new models' })
    await user.click(scan)

    expect(await screen.findByText(/^1 new model\. 2 models saved · last scan/)).toBeInTheDocument()

    await user.click(scan)

    expect(await screen.findByText(/^No new models\. 2 models saved · last scan/)).toBeInTheDocument()
  })

  it('shows why a scan failed', async () => {
    mockApi({
      [`GET ${BASE}`]: [okResponse({ keyConfigured: true, models: [], scannedAt: null })],
      [`POST ${BASE}/models/scan`]: [errorResponse(502, 'Could not scan the Jev models: Jev error (HTTP 529).')],
    })
    const user = userEvent.setup()

    render(<AdminJev token="tok" onLogout={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Scan for new models' }))

    expect(await screen.findByText('Could not scan the Jev models: Jev error (HTTP 529).')).toBeInTheDocument()
  })

  it('saves the Jev calls switch as a new version and refreshes the history', async () => {
    const saved = { ...UNSAVED, rev: 1, data: { enabled: true }, savedAt: SAVED_AT, savedBy: 'ana@example.com' }
    const entry = { at: SAVED_AT, author: 'ana@example.com', change: 'Created; Jev calls on', rev: 1 }
    mockApi({
      [`PUT ${BASE}/documents/jev`]: [okResponse(saved)],
      [`GET ${BASE}/documents/jev/history?page=1`]: [
        okResponse(NO_HISTORY),
        okResponse({ entries: [entry], total: 1, page: 1, pageSize: 5 }),
      ],
    })
    const user = userEvent.setup()

    render(<AdminJev token="tok" onLogout={vi.fn()} />)
    await user.click(await screen.findByRole('checkbox', { name: /Allow Jev calls/ }))

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save (v0 → v1)' }))

    expect(await screen.findByText('Created; Jev calls on')).toBeInTheDocument()
    expect(screen.getByText(/version 1 · saved .* by ana@example\.com/)).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    const [[, options]] = requestsTo('PUT', `${BASE}/documents/jev`)
    expect(JSON.parse(options.body)).toEqual({ rev: 0, data: { enabled: true } })
  })

  it('offers to reload the latest version after a conflict', async () => {
    const conflict =
      'luis@example.com saved version 1 while you were editing version 0. Nothing was saved. Reload the latest version and apply your changes again.'
    const latest = { ...UNSAVED, rev: 1, data: { enabled: true }, savedAt: SAVED_AT, savedBy: 'luis@example.com' }
    mockApi({
      [`GET ${BASE}/documents/jev`]: [okResponse(UNSAVED), okResponse(latest)],
      [`PUT ${BASE}/documents/jev`]: [errorResponse(409, conflict)],
    })
    const user = userEvent.setup()

    render(<AdminJev token="tok" onLogout={vi.fn()} />)
    await user.click(await screen.findByRole('checkbox', { name: /Allow Jev calls/ }))
    await user.click(screen.getByRole('button', { name: 'Save (v0 → v1)' }))

    expect(await screen.findByText(conflict)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reload latest' }))

    expect(await screen.findByText(/version 1 · saved .* by luis@example\.com/)).toBeInTheDocument()
    expect(screen.queryByText(conflict)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reload latest' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Allow Jev calls/ })).toBeChecked()
  })
})
