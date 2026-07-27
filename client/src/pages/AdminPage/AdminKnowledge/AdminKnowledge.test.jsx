import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminKnowledge from './AdminKnowledge.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockGet({ apiKeyConfigured = false, keyAvailable = false, vectorStoreId = '' } = {}) {
  return { ok: true, status: 200, json: async () => ({ apiKeyConfigured, keyAvailable, vectorStoreId }) }
}

describe('AdminKnowledge', () => {
  it('shows a loading state while the settings are being fetched', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(<AdminKnowledge token="tok" onLogout={vi.fn()} />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows an error when the settings fail to load', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    render(<AdminKnowledge token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Failed to load the knowledge base settings')).toBeInTheDocument()
  })

  it('shows the stored vector store and that it is running on the LLM section key', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ keyAvailable: true, vectorStoreId: 'vs_abc' }))

    render(<AdminKnowledge token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByDisplayValue('vs_abc')).toBeInTheDocument()
    expect(screen.getByText('configured')).toBeInTheDocument()
    expect(screen.getByText('using the LLM section key')).toBeInTheDocument()
  })

  it('reports a dedicated key when one is stored', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ apiKeyConfigured: true, keyAvailable: true }))

    render(<AdminKnowledge token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('dedicated key')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
  })

  it('reports not configured when there is no vector store', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet())

    render(<AdminKnowledge token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
  })

  it('saves a new vector store id', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ vectorStoreId: 'vs_123' }) })
    const user = userEvent.setup()

    render(<AdminKnowledge token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByPlaceholderText('vs_...')

    await user.type(input, 'vs_123')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/knowledge/vector-store')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ vectorStoreId: 'vs_123' })
  })

  it('clears the vector store id to disable the knowledge base', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ keyAvailable: true, vectorStoreId: 'vs_old' }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ vectorStoreId: '' }) })
    const user = userEvent.setup()

    render(<AdminKnowledge token="tok" onLogout={vi.fn()} />)

    await user.clear(await screen.findByDisplayValue('vs_old'))
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ vectorStoreId: '' })
  })

  it('surfaces a vector store error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'That does not look like a valid vector store id.' }),
      })
    const user = userEvent.setup()

    render(<AdminKnowledge token="tok" onLogout={vi.fn()} />)

    await user.type(await screen.findByPlaceholderText('vs_...'), 'bad')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText('That does not look like a valid vector store id.')).toBeInTheDocument()
  })

  it('marks the knowledge base configured once a key becomes available for the stored vector store', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ vectorStoreId: 'vs_abc' }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ apiKeyConfigured: true, keyAvailable: true }),
      })
    const user = userEvent.setup()

    render(<AdminKnowledge token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()

    await user.type(await screen.findByPlaceholderText('sk-...'), 'sk-knowledge')
    await user.click(screen.getByRole('button', { name: /save key/i }))

    expect(await screen.findByText('configured')).toBeInTheDocument()
  })

  it('saves a dedicated api key and clears the input (write-only)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ apiKeyConfigured: true, keyAvailable: true }),
      })
    const user = userEvent.setup()

    render(<AdminKnowledge token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByPlaceholderText('sk-...')

    await user.type(input, 'sk-knowledge')
    await user.click(screen.getByRole('button', { name: /save key/i }))

    expect(await screen.findByText('dedicated key')).toBeInTheDocument()
    expect(input).toHaveValue('')
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/knowledge/api-key')
    expect(JSON.parse(options.body)).toEqual({ apiKey: 'sk-knowledge' })
  })

  it('removes the dedicated key so it falls back to the LLM section key', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ apiKeyConfigured: true, keyAvailable: true }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ apiKeyConfigured: false }) })
    const user = userEvent.setup()

    render(<AdminKnowledge token="tok" onLogout={vi.fn()} />)
    await screen.findByText('dedicated key')

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(await screen.findByText('using the LLM section key')).toBeInTheDocument()
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ apiKey: '' })
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminKnowledge token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })

  it('logs out on a 401 when saving the vector store id', async () => {
    const onLogout = vi.fn()
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    const user = userEvent.setup()

    render(<AdminKnowledge token="tok" onLogout={onLogout} />)

    await user.type(await screen.findByPlaceholderText('vs_...'), 'vs_123')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
