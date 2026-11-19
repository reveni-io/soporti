import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminJev from './AdminJev.jsx'

const LATEST = { name: 'jev-latest', description: 'Most recent stable release', releaseDate: '2026-10-14' }
const PREVIEW = { name: 'jev-preview', description: 'Most recent release', releaseDate: '2026-10-14' }
const SCANNED_AT = '2026-11-17T08:30:00.000Z'

function okResponse(data) {
  return { ok: true, status: 200, json: async () => data }
}

function errorResponse(status, error) {
  return { ok: false, status, json: async () => ({ error }) }
}

function mockConfig({ keyConfigured = false, models = [], scannedAt = null } = {}) {
  return okResponse({ keyConfigured, models, scannedAt })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AdminJev', () => {
  it('shows the key as not configured and keeps the scan off without a key', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockConfig())

    render(<AdminJev token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Jev API key')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scan for new models' })).toBeDisabled()
    expect(screen.getByText('No models saved yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('shows the saved catalog when the key is configured', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockConfig({ keyConfigured: true, models: [LATEST], scannedAt: SCANNED_AT }))

    render(<AdminJev token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Paste a new key to replace it')).toBeInTheDocument()
    expect(screen.getByText(/^1 model saved · last scan/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scan for new models' })).toBeEnabled()
  })

  it('shows the latency of a successful connection test', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockConfig({ keyConfigured: true }))
      .mockResolvedValueOnce(okResponse({ latencyMs: 312 }))
    const user = userEvent.setup()

    render(<AdminJev token="tok" onLogout={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Test connection' }))

    expect(await screen.findByText('Connected · 312 ms')).toBeInTheDocument()
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/jev/test')
    expect(options.method).toBe('POST')
  })

  it('shows why a connection test failed until a new key is saved', async () => {
    const failure = 'No API key saved. Save the key above and test again.'
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockConfig())
      .mockResolvedValueOnce(errorResponse(422, failure))
      .mockResolvedValueOnce(okResponse({ keyConfigured: true }))
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
    const [url, options] = global.fetch.mock.calls[2]
    expect(url).toContain('/api/admin/config/jev/api-key')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ apiKey: 'jev-secret' })
  })

  it('saves the scanned models and says how many are new', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockConfig({ keyConfigured: true, models: [LATEST], scannedAt: SCANNED_AT }))
      .mockResolvedValueOnce(okResponse({ models: [LATEST, PREVIEW], scannedAt: SCANNED_AT, newModels: 1 }))
      .mockResolvedValueOnce(okResponse({ models: [LATEST, PREVIEW], scannedAt: SCANNED_AT, newModels: 0 }))
    const user = userEvent.setup()

    render(<AdminJev token="tok" onLogout={vi.fn()} />)
    const scan = await screen.findByRole('button', { name: 'Scan for new models' })
    await user.click(scan)

    expect(await screen.findByText(/^1 new model\. 2 models saved · last scan/)).toBeInTheDocument()
    expect(global.fetch.mock.calls[1][0]).toContain('/api/admin/config/jev/models/scan')

    await user.click(scan)

    expect(await screen.findByText(/^No new models\. 2 models saved · last scan/)).toBeInTheDocument()
  })

  it('shows why a scan failed', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockConfig({ keyConfigured: true }))
      .mockResolvedValueOnce(errorResponse(502, 'Could not scan the Jev models: Jev error (HTTP 529).'))
    const user = userEvent.setup()

    render(<AdminJev token="tok" onLogout={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Scan for new models' }))

    expect(await screen.findByText('Could not scan the Jev models: Jev error (HTTP 529).')).toBeInTheDocument()
  })
})
