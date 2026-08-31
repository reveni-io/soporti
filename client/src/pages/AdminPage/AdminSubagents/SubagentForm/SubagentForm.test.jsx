import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SubagentForm from './SubagentForm.jsx'

const TOOL_GROUPS = [
  { id: 'repo', label: 'Repositories', configured: true, tools: ['search_code', 'get_file_contents'] },
  { id: 'sentry', label: 'Sentry', configured: true, tools: ['get_sentry_issue'] },
]

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
]

const EXISTING = {
  id: 9,
  name: 'code_investigator',
  description: 'Owns the codebase.',
  instructions: 'Read the code.',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  tools: ['search_code'],
  exclusive: true,
  enabled: true,
}

function ok(body = {}) {
  return { ok: true, status: 201, json: async () => body }
}

function lastBody() {
  const [, options] = global.fetch.mock.calls[global.fetch.mock.calls.length - 1]
  return JSON.parse(options.body)
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue(ok({ subagent: { id: 1 } }))
})

describe('SubagentForm', () => {
  it('sends the whole definition to the create endpoint', async () => {
    const onSaved = vi.fn()
    render(
      <SubagentForm
        token="tok"
        onLogout={vi.fn()}
        subagent={null}
        subagents={[]}
        providers={PROVIDERS}
        toolGroups={TOOL_GROUPS}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />
    )

    await userEvent.type(screen.getByLabelText('Name'), 'log_detective')
    await userEvent.type(screen.getByLabelText('What it owns'), 'Owns the logs.')
    await userEvent.type(screen.getByLabelText('System prompt'), 'Search the logs.')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Searching code' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create subagent' }))

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/admin/subagents')
    expect(options.method).toBe('POST')
    expect(lastBody()).toEqual({
      name: 'log_detective',
      description: 'Owns the logs.',
      instructions: 'Search the logs.',
      provider: null,
      model: null,
      tools: ['search_code'],
      exclusive: false,
      enabled: true,
    })
    expect(onSaved).toHaveBeenCalledWith({ id: 1 })
  })

  it('does not save while the fields are being edited', async () => {
    render(
      <SubagentForm
        token="tok"
        onLogout={vi.fn()}
        subagent={null}
        subagents={[]}
        providers={PROVIDERS}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    await userEvent.type(screen.getByLabelText('Name'), 'log_detective')
    await userEvent.type(screen.getByLabelText('What it owns'), 'Owns the logs.')

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('updates an existing subagent through its own endpoint, prefilled', async () => {
    render(
      <SubagentForm
        token="tok"
        onLogout={vi.fn()}
        subagent={EXISTING}
        subagents={[EXISTING]}
        providers={PROVIDERS}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Name')).toHaveValue('code_investigator')
    expect(screen.getByLabelText('Model')).toHaveValue('claude-sonnet-5')
    expect(screen.getByRole('checkbox', { name: 'Searching code' })).toBeChecked()

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/admin/subagents/9')
    expect(options.method).toBe('PUT')
    expect(lastBody()).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5', exclusive: true })
  })

  it('hides the model input while the global selection is followed', async () => {
    render(
      <SubagentForm
        token="tok"
        onLogout={vi.fn()}
        subagent={EXISTING}
        subagents={[EXISTING]}
        providers={PROVIDERS}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Model')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Provider'), '')

    expect(screen.queryByLabelText('Model')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(lastBody()).toMatchObject({ provider: null, model: null })
  })

  it('changes the description help text with the exclusive flag, because the patterns differ', async () => {
    render(
      <SubagentForm
        token="tok"
        onLogout={vi.fn()}
        subagent={null}
        subagents={[]}
        providers={PROVIDERS}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText(/countable reason to hand off/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: /Take these tools away/ }))

    expect(screen.getByText(/Name the territory this subagent owns/)).toBeInTheDocument()
  })

  it('leaves the main agent its tools by default, so saving takes nothing away', () => {
    render(
      <SubagentForm
        token="tok"
        onLogout={vi.fn()}
        subagent={null}
        subagents={[]}
        providers={PROVIDERS}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('checkbox', { name: /Take these tools away/ })).not.toBeChecked()
  })

  it('refuses to save until the name, description and prompt are all there', async () => {
    render(
      <SubagentForm
        token="tok"
        onLogout={vi.fn()}
        subagent={null}
        subagents={[]}
        providers={PROVIDERS}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const submit = screen.getByRole('button', { name: 'Create subagent' })
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Name'), 'log_detective')
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText('What it owns'), 'Owns the logs.')
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText('System prompt'), 'Search the logs.')
    expect(submit).toBeEnabled()
  })

  it('explains an invalid name instead of silently refusing to save', async () => {
    render(
      <SubagentForm
        token="tok"
        onLogout={vi.fn()}
        subagent={null}
        subagents={[]}
        providers={PROVIDERS}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    await userEvent.type(screen.getByLabelText('Name'), 'a')

    expect(screen.getByText(/lowercase letters, numbers and underscores/)).toBeInTheDocument()
  })

  it('shows the error the API returned and does not report a save', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: '"search_code" already belongs to the subagent "context_gatherer".' }),
    })
    const onSaved = vi.fn()
    render(
      <SubagentForm
        token="tok"
        onLogout={vi.fn()}
        subagent={EXISTING}
        subagents={[EXISTING]}
        providers={PROVIDERS}
        toolGroups={TOOL_GROUPS}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByText(/already belongs to the subagent/)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('logs out instead of rendering an error when the session expired', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
    const onLogout = vi.fn()
    render(
      <SubagentForm
        token="tok"
        onLogout={onLogout}
        subagent={EXISTING}
        subagents={[EXISTING]}
        providers={PROVIDERS}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('marks a tool another enabled exclusive subagent owns as taken', () => {
    const other = { ...EXISTING, id: 3, name: 'context_gatherer', tools: ['get_sentry_issue'] }
    render(
      <SubagentForm
        token="tok"
        onLogout={vi.fn()}
        subagent={EXISTING}
        subagents={[EXISTING, other]}
        providers={PROVIDERS}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('checkbox', { name: 'Reading Sentry issue' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Searching code' })).toBeEnabled()
  })

  it('selects a whole group at once, skipping what is already taken', async () => {
    const other = { ...EXISTING, id: 3, name: 'context_gatherer', tools: ['get_file_contents'] }
    render(
      <SubagentForm
        token="tok"
        onLogout={vi.fn()}
        subagent={null}
        subagents={[other]}
        providers={PROVIDERS}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    await userEvent.type(screen.getByLabelText('Name'), 'log_detective')
    await userEvent.type(screen.getByLabelText('What it owns'), 'Owns the logs.')
    await userEvent.type(screen.getByLabelText('System prompt'), 'Search the logs.')
    const [selectAll] = screen.getAllByRole('button', { name: 'Select all' })
    await userEvent.click(selectAll)
    await userEvent.click(screen.getByRole('button', { name: 'Create subagent' }))

    expect(lastBody().tools).toEqual(['search_code'])
  })

  it('abandons the edit without saving anything', async () => {
    const onCancel = vi.fn()
    render(
      <SubagentForm
        token="tok"
        onLogout={vi.fn()}
        subagent={EXISTING}
        subagents={[EXISTING]}
        providers={PROVIDERS}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={onCancel}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
