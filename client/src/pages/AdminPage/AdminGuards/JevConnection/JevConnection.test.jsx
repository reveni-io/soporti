import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import JevConnection from './JevConnection.jsx'

const BASE = '/api/admin/config/jev'
const NO_KEY = { keyConfigured: false }
const WITH_KEY = { keyConfigured: true }

function okResponse(data) {
  return { ok: true, status: 200, json: async () => data }
}

function errorResponse(status, error) {
  return { ok: false, status, json: async () => ({ error }) }
}

function mockApi(routes) {
  const handlers = { ...routes }
  global.fetch = vi.fn(async (url, options = {}) => {
    const responses = handlers[`${options.method ?? 'GET'} ${url}`]
    if (!responses) throw new Error(`Unexpected request: ${options.method ?? 'GET'} ${url}`)
    return responses.length > 1 ? responses.shift() : responses[0]
  })
}

function requestsTo(method, path) {
  return global.fetch.mock.calls.filter(([url, options = {}]) => url === path && (options.method ?? 'GET') === method)
}

function Harness({ initial }) {
  const [config, setConfig] = useState(initial)

  function handleConfigChange(patch) {
    setConfig(current => ({ ...current, ...patch }))
  }

  return <JevConnection token="tok" onLogout={vi.fn()} config={config} onConfigChange={handleConfigChange} />
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('JevConnection', () => {
  it('starts without a key, always on the latest Jev model, with no switch nor model list', async () => {
    mockApi({})

    render(<Harness initial={NO_KEY} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.getByText(/always in its latest release/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Scan for new models' })).not.toBeInTheDocument()
  })

  it('shows a saved key as configured', async () => {
    mockApi({})

    render(<Harness initial={WITH_KEY} />)

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Paste a new key to replace it')).toBeInTheDocument()
  })

  it('shows the latency of a successful connection test', async () => {
    mockApi({ [`POST ${BASE}/test`]: [okResponse({ latencyMs: 312 })] })
    const user = userEvent.setup()

    render(<Harness initial={NO_KEY} />)
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

    render(<Harness initial={NO_KEY} />)
    await user.click(await screen.findByRole('button', { name: 'Test connection' }))

    expect(await screen.findByText(failure)).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Jev API key'), 'jev-secret')
    await user.click(screen.getByRole('button', { name: 'Save key' }))

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.queryByText(failure)).not.toBeInTheDocument()
    const [[, options]] = requestsTo('PUT', `${BASE}/api-key`)
    expect(JSON.parse(options.body)).toEqual({ apiKey: 'jev-secret' })
  })
})
