import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import JevConnection from './JevConnection.jsx'

const BASE = '/api/admin/config/jev'
const LATEST = { name: 'jev-latest', description: 'Most recent stable release', releaseDate: '2026-10-14' }
const PREVIEW = { name: 'jev-preview', description: 'Most recent release', releaseDate: '2026-10-14' }
const SCANNED_AT = '2026-11-17T08:30:00.000Z'
const SAVED_AT = '2026-11-19T10:00:00.000Z'
const NO_KEY = { keyConfigured: false, models: [], scannedAt: null }
const WITH_KEY = { keyConfigured: true, models: [LATEST], scannedAt: SCANNED_AT }
const UNSAVED = { id: 'jev', rev: 0, data: { enabled: false }, setVersion: 0, savedAt: null, savedBy: null }

function okResponse(data) {
  return { ok: true, status: 200, json: async () => data }
}

function errorResponse(status, error) {
  return { ok: false, status, json: async () => ({ error }) }
}

function mockApi(routes) {
  const handlers = {
    [`GET ${BASE}/documents/jev`]: [okResponse(UNSAVED)],
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

function Harness({ initial, onChanged }) {
  const [config, setConfig] = useState(initial)

  function handleConfigChange(patch) {
    setConfig(current => ({ ...current, ...patch }))
  }

  return (
    <JevConnection
      token="tok"
      onLogout={vi.fn()}
      config={config}
      onConfigChange={handleConfigChange}
      onChanged={onChanged}
    />
  )
}

function renderConnection(config = NO_KEY) {
  const onChanged = vi.fn()
  render(<Harness initial={config} onChanged={onChanged} />)
  return { onChanged }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('JevConnection', () => {
  it('starts without a key or models, with Jev calls off and locked until a key is saved', async () => {
    mockApi({})

    renderConnection()

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scan for new models' })).toBeDisabled()
    expect(screen.getByText('No models saved yet.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Allow Jev calls/ })).toBeDisabled()
    expect(screen.getByText('Save the API key above before turning Jev calls on.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('shows the saved catalog when the key is configured', async () => {
    mockApi({})

    renderConnection(WITH_KEY)

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Paste a new key to replace it')).toBeInTheDocument()
    expect(screen.getByText(/^1 model saved · last scan/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scan for new models' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: /Allow Jev calls/ })).toBeEnabled()
  })

  it('shows the latency of a successful connection test', async () => {
    mockApi({ [`POST ${BASE}/test`]: [okResponse({ latencyMs: 312 })] })
    const user = userEvent.setup()

    renderConnection()
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

    const { onChanged } = renderConnection()
    await user.click(await screen.findByRole('button', { name: 'Test connection' }))

    expect(await screen.findByText(failure)).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Jev API key'), 'jev-secret')
    await user.click(screen.getByRole('button', { name: 'Save key' }))

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.queryByText(failure)).not.toBeInTheDocument()
    const [[, options]] = requestsTo('PUT', `${BASE}/api-key`)
    expect(JSON.parse(options.body)).toEqual({ apiKey: 'jev-secret' })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('saves the scanned models and says how many are new', async () => {
    mockApi({
      [`POST ${BASE}/models/scan`]: [
        okResponse({ models: [LATEST, PREVIEW], scannedAt: SCANNED_AT, newModels: 1 }),
        okResponse({ models: [LATEST, PREVIEW], scannedAt: SCANNED_AT, newModels: 0 }),
      ],
    })
    const user = userEvent.setup()

    renderConnection(WITH_KEY)
    const scan = await screen.findByRole('button', { name: 'Scan for new models' })
    await user.click(scan)

    expect(await screen.findByText(/^1 new model\. 2 models saved · last scan/)).toBeInTheDocument()

    await user.click(scan)

    expect(await screen.findByText(/^No new models\. 2 models saved · last scan/)).toBeInTheDocument()
  })

  it('shows why a scan failed', async () => {
    mockApi({
      [`POST ${BASE}/models/scan`]: [errorResponse(502, 'Could not scan the Jev models: Jev error (HTTP 529).')],
    })
    const user = userEvent.setup()

    renderConnection({ ...WITH_KEY, models: [], scannedAt: null })
    await user.click(await screen.findByRole('button', { name: 'Scan for new models' }))

    expect(await screen.findByText('Could not scan the Jev models: Jev error (HTTP 529).')).toBeInTheDocument()
  })

  it('saves the Jev calls switch and says the settings changed', async () => {
    const saved = { ...UNSAVED, rev: 1, data: { enabled: true }, savedAt: SAVED_AT, savedBy: 'ana@example.com' }
    mockApi({ [`PUT ${BASE}/documents/jev`]: [okResponse(saved)] })
    const user = userEvent.setup()

    const { onChanged } = renderConnection(WITH_KEY)
    await user.click(await screen.findByRole('checkbox', { name: /Allow Jev calls/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalledTimes(1)
    const [[, options]] = requestsTo('PUT', `${BASE}/documents/jev`)
    expect(JSON.parse(options.body)).toEqual({ rev: 0, data: { enabled: true }, restoredFrom: null })
  })

  it('offers to reload the latest version after a conflict', async () => {
    const conflict = 'luis@example.com saved version 1 while you were editing version 0. Nothing was saved.'
    const latest = { ...UNSAVED, rev: 1, data: { enabled: true }, savedAt: SAVED_AT, savedBy: 'luis@example.com' }
    mockApi({
      [`GET ${BASE}/documents/jev`]: [okResponse(UNSAVED), okResponse(latest)],
      [`PUT ${BASE}/documents/jev`]: [errorResponse(409, conflict)],
    })
    const user = userEvent.setup()

    renderConnection(WITH_KEY)
    await user.click(await screen.findByRole('checkbox', { name: /Allow Jev calls/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(conflict)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reload latest' }))

    expect(await screen.findByRole('checkbox', { name: /Allow Jev calls/ })).toBeChecked()
    expect(screen.queryByText(conflict)).not.toBeInTheDocument()
  })

  it('shows why the settings could not load', async () => {
    mockApi({ [`GET ${BASE}/documents/jev`]: [errorResponse(500, 'Failed to load the settings.')] })

    renderConnection()

    expect(await screen.findByText('Failed to load the settings.')).toBeInTheDocument()
  })
})
