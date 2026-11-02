import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminVideo from './AdminVideo.jsx'

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
]
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

beforeEach(() => {
  vi.restoreAllMocks()
})

function configResponse({ provider = 'openai', model = '', effort = 'max', configured = true } = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ provider, model, effort, providers: PROVIDERS, effortLevels: EFFORT_LEVELS, configured }),
  }
}

function okResponse(body) {
  return { ok: true, status: 200, json: async () => body }
}

describe('AdminVideo', () => {
  it('shows a loading state while the settings are being fetched', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(<AdminVideo token="tok" onLogout={vi.fn()} />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows an error when the settings fail to load', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    render(<AdminVideo token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Failed to load the video settings')).toBeInTheDocument()
  })

  it('renders the stored provider, model and effort', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(configResponse({ provider: 'anthropic', model: 'claude-opus-5', effort: 'xhigh' }))

    render(<AdminVideo token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByRole('combobox', { name: 'Video provider' })).toHaveValue('anthropic')
    expect(screen.getByPlaceholderText('Same as the LLM section')).toHaveValue('claude-opus-5')
    expect(screen.getByRole('combobox', { name: 'Video reasoning effort' })).toHaveValue('xhigh')
    expect(screen.getByRole('option', { name: 'max' })).toBeInTheDocument()
    expect(screen.getByText('configured')).toBeInTheDocument()
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/admin/config/video')
    expect(options.headers.Authorization).toBe('Bearer tok')
  })

  it('explains what the section drives and that higher efforts cost more', async () => {
    global.fetch = vi.fn().mockResolvedValue(configResponse())

    render(<AdminVideo token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText(/storyboard and video agents run on these settings/i)).toBeInTheDocument()
    expect(screen.getByText(/takes more time and costs more/i)).toBeInTheDocument()
  })

  it('reports the settings as not configured when the provider lacks a key or a model', async () => {
    global.fetch = vi.fn().mockResolvedValue(configResponse({ configured: false }))

    render(<AdminVideo token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
  })

  it('saves the provider and refreshes the status', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(configResponse({ provider: 'openai', configured: false }))
      .mockResolvedValueOnce(okResponse({ provider: 'anthropic', configured: true }))
    const user = userEvent.setup()

    render(<AdminVideo token="tok" onLogout={vi.fn()} />)
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Video provider' }), 'anthropic')
    await user.click(screen.getByRole('button', { name: 'Save provider' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(screen.getByText('configured')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(2)
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/video/provider')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ provider: 'anthropic' })
  })

  it('saves the model', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(configResponse())
      .mockResolvedValueOnce(okResponse({ model: 'gpt-5.2-codex', configured: true }))
    const user = userEvent.setup()

    render(<AdminVideo token="tok" onLogout={vi.fn()} />)
    await user.type(await screen.findByPlaceholderText('Same as the LLM section'), 'gpt-5.2-codex')
    await user.click(screen.getByRole('button', { name: 'Save model' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Same as the LLM section')).toHaveValue('gpt-5.2-codex')
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/video/model')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ model: 'gpt-5.2-codex' })
  })

  it('clears the model so the LLM section model applies again', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(configResponse({ model: 'gpt-5.2-codex' }))
      .mockResolvedValueOnce(okResponse({ model: '', configured: false }))
    const user = userEvent.setup()

    render(<AdminVideo token="tok" onLogout={vi.fn()} />)
    await user.clear(await screen.findByPlaceholderText('Same as the LLM section'))
    await user.click(screen.getByRole('button', { name: 'Save model' }))

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Same as the LLM section')).toHaveValue('')
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ model: '' })
  })

  it('saves the reasoning effort', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(configResponse({ effort: 'max' }))
      .mockResolvedValueOnce(okResponse({ effort: 'high', configured: true }))
    const user = userEvent.setup()

    render(<AdminVideo token="tok" onLogout={vi.fn()} />)
    const select = await screen.findByRole('combobox', { name: 'Video reasoning effort' })
    await user.selectOptions(select, 'high')
    await user.click(screen.getByRole('button', { name: 'Save effort' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(select).toHaveValue('high')
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/video/effort')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ effort: 'high' })
  })

  it('surfaces a validation error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(configResponse())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'The model must be a single id without spaces, up to 100 characters.' }),
      })
    const user = userEvent.setup()

    render(<AdminVideo token="tok" onLogout={vi.fn()} />)
    await user.type(await screen.findByPlaceholderText('Same as the LLM section'), 'gpt 5')
    await user.click(screen.getByRole('button', { name: 'Save model' }))

    expect(
      await screen.findByText('The model must be a single id without spaces, up to 100 characters.')
    ).toBeInTheDocument()
  })

  it('logs out on a 401 while loading', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminVideo token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalledTimes(1)
    })
  })

  it('logs out on a 401 when saving', async () => {
    const onLogout = vi.fn()
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(configResponse())
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    const user = userEvent.setup()

    render(<AdminVideo token="tok" onLogout={onLogout} />)
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Video reasoning effort' }), 'low')
    await user.click(screen.getByRole('button', { name: 'Save effort' }))

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })
})
