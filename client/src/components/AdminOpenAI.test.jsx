import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminOpenAI from './AdminOpenAI.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockGet({ apiKeyConfigured = false, model = '', vectorStoreId = '' } = {}) {
  return { ok: true, status: 200, json: async () => ({ apiKeyConfigured, model, vectorStoreId }) }
}

describe('AdminOpenAI', () => {
  it('shows a loading state while the settings are being fetched', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(<AdminOpenAI token="tok" onLogout={vi.fn()} />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows the API key status as configured with the stored model and vector store id', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockGet({ apiKeyConfigured: true, model: 'gpt-4o', vectorStoreId: 'vs_abc' }))

    render(<AdminOpenAI token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.getByDisplayValue('gpt-4o')).toBeInTheDocument()
    expect(screen.getByDisplayValue('vs_abc')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
  })

  it('shows not configured when there is no API key', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet())

    render(<AdminOpenAI token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('shows an error when the settings fail to load', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    render(<AdminOpenAI token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Failed to load the OpenAI settings')).toBeInTheDocument()
  })

  it('saves a new API key and clears the input (write-only)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ apiKeyConfigured: true }) })
    const user = userEvent.setup()

    render(<AdminOpenAI token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    const input = screen.getByPlaceholderText('sk-...')
    await user.type(input, 'sk-newkey')
    await user.click(screen.getByRole('button', { name: /save key/i }))

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(input).toHaveValue('')
    expect(screen.getByText('Saved')).toBeInTheDocument()
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/openai/api-key')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ apiKey: 'sk-newkey' })
  })

  it('removes the API key', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ apiKeyConfigured: true }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ apiKeyConfigured: false }) })
    const user = userEvent.setup()

    render(<AdminOpenAI token="tok" onLogout={vi.fn()} />)
    await screen.findByText('configured')

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ apiKey: '' })
  })

  it('disables the save key button while the input is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet())
    const user = userEvent.setup()

    render(<AdminOpenAI token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    expect(screen.getByRole('button', { name: /save key/i })).toBeDisabled()

    await user.type(screen.getByPlaceholderText('sk-...'), 'sk-key')
    expect(screen.getByRole('button', { name: /save key/i })).toBeEnabled()
  })

  it('surfaces an API key error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'That does not look like a valid OpenAI API key.' }),
      })
    const user = userEvent.setup()

    render(<AdminOpenAI token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    await user.type(screen.getByPlaceholderText('sk-...'), 'bad')
    await user.click(screen.getByRole('button', { name: /save key/i }))

    expect(await screen.findByText('That does not look like a valid OpenAI API key.')).toBeInTheDocument()
  })

  it('saves the model once it is edited', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ model: 'gpt-4o' }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ model: 'gpt-5.2-codex' }) })
    const user = userEvent.setup()

    render(<AdminOpenAI token="tok" onLogout={vi.fn()} />)
    await screen.findByDisplayValue('gpt-4o')

    // The button stays disabled until the value actually changes.
    expect(screen.getByRole('button', { name: /save model/i })).toBeDisabled()

    const input = screen.getByDisplayValue('gpt-4o')
    await user.clear(input)
    await user.type(input, 'gpt-5.2-codex')
    await user.click(screen.getByRole('button', { name: /save model/i }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(input).toHaveValue('gpt-5.2-codex')
    expect(screen.getByRole('button', { name: /save model/i })).toBeDisabled()
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/openai/model')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ model: 'gpt-5.2-codex' })
  })

  it('surfaces a model error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ model: 'gpt-4o' }))
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'The model cannot be empty.' }),
      })
    const user = userEvent.setup()

    render(<AdminOpenAI token="tok" onLogout={vi.fn()} />)
    await screen.findByDisplayValue('gpt-4o')

    await user.clear(screen.getByDisplayValue('gpt-4o'))
    await user.click(screen.getByRole('button', { name: /save model/i }))

    expect(await screen.findByText('The model cannot be empty.')).toBeInTheDocument()
  })

  it('falls back to a generic model error when the response has no body', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ model: 'gpt-4o' }))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('no body')
        },
      })
    const user = userEvent.setup()

    render(<AdminOpenAI token="tok" onLogout={vi.fn()} />)
    await screen.findByDisplayValue('gpt-4o')

    const input = screen.getByDisplayValue('gpt-4o')
    await user.clear(input)
    await user.type(input, 'gpt-5')
    await user.click(screen.getByRole('button', { name: /save model/i }))

    expect(await screen.findByText('Failed to save the model')).toBeInTheDocument()
  })

  it('saves a new vector store id', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ vectorStoreId: 'vs_123' }) })
    const user = userEvent.setup()

    render(<AdminOpenAI token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    // The button stays disabled until the value actually changes.
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()

    const input = screen.getByPlaceholderText('vs_...')
    await user.type(input, 'vs_123')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(input).toHaveValue('vs_123')
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/openai/vector-store')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ vectorStoreId: 'vs_123' })
  })

  it('clears the vector store id to disable the knowledge base', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ vectorStoreId: 'vs_old' }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ vectorStoreId: '' }) })
    const user = userEvent.setup()

    render(<AdminOpenAI token="tok" onLogout={vi.fn()} />)
    await screen.findByDisplayValue('vs_old')

    await user.clear(screen.getByDisplayValue('vs_old'))
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

    render(<AdminOpenAI token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    await user.type(screen.getByPlaceholderText('vs_...'), 'bad')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText('That does not look like a valid vector store id.')).toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminOpenAI token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })

  it('logs out on a 401 when saving the API key', async () => {
    const onLogout = vi.fn()
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    const user = userEvent.setup()

    render(<AdminOpenAI token="tok" onLogout={onLogout} />)
    await screen.findByText('not configured')

    await user.type(screen.getByPlaceholderText('sk-...'), 'sk-key')
    await user.click(screen.getByRole('button', { name: /save key/i }))

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })

  it('logs out on a 401 when saving the model', async () => {
    const onLogout = vi.fn()
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ model: 'gpt-4o' }))
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    const user = userEvent.setup()

    render(<AdminOpenAI token="tok" onLogout={onLogout} />)
    await screen.findByDisplayValue('gpt-4o')

    const input = screen.getByDisplayValue('gpt-4o')
    await user.clear(input)
    await user.type(input, 'gpt-5')
    await user.click(screen.getByRole('button', { name: /save model/i }))

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

    render(<AdminOpenAI token="tok" onLogout={onLogout} />)
    await screen.findByText('not configured')

    await user.type(screen.getByPlaceholderText('vs_...'), 'vs_123')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
