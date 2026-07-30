import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminLlm from './AdminLlm.jsx'

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
]
const EFFORT_LEVELS = ['low', 'medium', 'high']

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockGet({
  provider = 'openai',
  openaiApiKeyConfigured = false,
  openaiModel = '',
  anthropicApiKeyConfigured = false,
  anthropicModel = '',
  reasoningEffort = 'medium',
} = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      provider,
      providers: PROVIDERS,
      openaiApiKeyConfigured,
      openaiModel,
      anthropicApiKeyConfigured,
      anthropicModel,
      reasoningEffort,
      reasoningEffortLevels: EFFORT_LEVELS,
    }),
  }
}

describe('AdminLlm', () => {
  it('shows a loading state while the settings are being fetched', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows an error when the settings fail to load', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Failed to load the LLM settings')).toBeInTheDocument()
  })

  it('preselects the active provider and offers every registered one', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ provider: 'anthropic' }))

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)

    const select = await screen.findByRole('combobox', { name: /active provider/i })
    expect(select).toHaveValue('anthropic')
    expect(screen.getByRole('option', { name: 'OpenAI' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Anthropic' })).toBeInTheDocument()
  })

  it('does not switch the provider until save is pressed', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ provider: 'openai' }))
    const user = userEvent.setup()

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)
    const select = await screen.findByRole('combobox', { name: /active provider/i })

    await user.selectOptions(select, 'anthropic')

    expect(select).toHaveValue('anthropic')
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('keeps save disabled until the selection actually changes', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ provider: 'openai' }))
    const user = userEvent.setup()

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)
    const save = await screen.findByRole('button', { name: /save provider/i })

    expect(save).toBeDisabled()

    await user.selectOptions(screen.getByRole('combobox', { name: /active provider/i }), 'anthropic')

    expect(save).toBeEnabled()
  })

  it('saves the selected provider when save is pressed', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ provider: 'openai' }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ provider: 'anthropic' }) })
    const user = userEvent.setup()

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)
    const select = await screen.findByRole('combobox', { name: /active provider/i })

    await user.selectOptions(select, 'anthropic')
    await user.click(screen.getByRole('button', { name: /save provider/i }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(select).toHaveValue('anthropic')
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/llm/provider')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ provider: 'anthropic' })
  })

  it('preselects the stored reasoning effort and offers every supported level', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ reasoningEffort: 'high' }))

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)
    const select = await screen.findByRole('combobox', { name: /reasoning effort/i })

    expect(select).toHaveValue('high')
    expect(screen.getAllByRole('option').map(option => option.value)).toEqual(expect.arrayContaining(EFFORT_LEVELS))
  })

  it('does not change the reasoning effort until save is pressed', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ reasoningEffort: 'medium' }))
    const user = userEvent.setup()

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)
    const select = await screen.findByRole('combobox', { name: /reasoning effort/i })

    await user.selectOptions(select, 'low')

    expect(select).toHaveValue('low')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('saves the selected reasoning effort when save is pressed', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ reasoningEffort: 'medium' }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ effort: 'low' }) })
    const user = userEvent.setup()

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)
    const select = await screen.findByRole('combobox', { name: /reasoning effort/i })

    await user.selectOptions(select, 'low')
    await user.click(screen.getByRole('button', { name: /save effort/i }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(select).toHaveValue('low')
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/llm/reasoning-effort')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ effort: 'low' })
  })

  it('surfaces a provider error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'That is not a supported LLM provider.' }),
      })
    const user = userEvent.setup()

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)
    const select = await screen.findByRole('combobox', { name: /active provider/i })

    await user.selectOptions(select, 'anthropic')
    await user.click(screen.getByRole('button', { name: /save provider/i }))

    expect(await screen.findByText('That is not a supported LLM provider.')).toBeInTheDocument()
  })

  it('reports each provider key status separately and never renders a key', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockGet({
        openaiApiKeyConfigured: true,
        openaiModel: 'gpt-4o',
        anthropicApiKeyConfigured: false,
        anthropicModel: 'claude-opus-5',
      })
    )

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)

    await screen.findByDisplayValue('gpt-4o')
    expect(screen.getByDisplayValue('claude-opus-5')).toBeInTheDocument()
    expect(screen.getByText('configured')).toBeInTheDocument()
    expect(screen.getByText('not configured')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Paste a new key to replace it')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument()
  })

  it('saves a new openai key and clears the input (write-only)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ apiKeyConfigured: true }) })
    const user = userEvent.setup()

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByPlaceholderText('sk-...')

    await user.type(input, 'sk-newkey')
    await user.click(screen.getByRole('button', { name: /save key/i }))

    await waitFor(() => expect(input).toHaveValue(''))
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/openai/api-key')
    expect(JSON.parse(options.body)).toEqual({ apiKey: 'sk-newkey' })
  })

  it('saves a new anthropic key against the anthropic endpoint', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ apiKeyConfigured: true }) })
    const user = userEvent.setup()

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByPlaceholderText('sk-ant-...')

    await user.type(input, 'sk-ant-newkey')
    await user.click(screen.getByRole('button', { name: /save anthropic key/i }))

    await waitFor(() => expect(input).toHaveValue(''))
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/anthropic/api-key')
    expect(JSON.parse(options.body)).toEqual({ apiKey: 'sk-ant-newkey' })
  })

  it('removes the openai key', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ openaiApiKeyConfigured: true }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ apiKeyConfigured: false }) })
    const user = userEvent.setup()

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)
    await screen.findByText('configured')

    await user.click(screen.getByRole('button', { name: /remove/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    expect(global.fetch.mock.calls[1][0]).toContain('/api/admin/config/openai/api-key')
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ apiKey: '' })
  })

  it('saves the openai model once it is edited', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ openaiModel: 'gpt-4o' }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ model: 'gpt-5.2-codex' }) })
    const user = userEvent.setup()

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByDisplayValue('gpt-4o')

    await user.clear(input)
    await user.type(input, 'gpt-5.2-codex')
    await user.click(screen.getByRole('button', { name: /^save model$/i }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/openai/model')
    expect(JSON.parse(options.body)).toEqual({ model: 'gpt-5.2-codex' })
  })

  it('saves the anthropic model against the anthropic endpoint', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ anthropicModel: 'claude-sonnet-5' }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ model: 'claude-opus-5' }) })
    const user = userEvent.setup()

    render(<AdminLlm token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByDisplayValue('claude-sonnet-5')

    await user.clear(input)
    await user.type(input, 'claude-opus-5')
    await user.click(screen.getByRole('button', { name: /save anthropic model/i }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/anthropic/model')
    expect(JSON.parse(options.body)).toEqual({ model: 'claude-opus-5' })
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminLlm token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })

  it('logs out on a 401 when switching provider', async () => {
    const onLogout = vi.fn()
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    const user = userEvent.setup()

    render(<AdminLlm token="tok" onLogout={onLogout} />)
    const select = await screen.findByRole('combobox', { name: /active provider/i })

    await user.selectOptions(select, 'anthropic')
    await user.click(screen.getByRole('button', { name: /save provider/i }))

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })

  it('logs out on a 401 when saving a key', async () => {
    const onLogout = vi.fn()
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    const user = userEvent.setup()

    render(<AdminLlm token="tok" onLogout={onLogout} />)
    const input = await screen.findByPlaceholderText('sk-...')

    await user.type(input, 'sk-key')
    await user.click(screen.getByRole('button', { name: /save key/i }))

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
