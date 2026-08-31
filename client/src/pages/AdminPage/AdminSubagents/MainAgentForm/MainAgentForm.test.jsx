import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MainAgentForm from './MainAgentForm.jsx'

const TOOL_GROUPS = [
  { id: 'repo', label: 'Repositories', configured: true, tools: ['search_code', 'get_file_contents'] },
  { id: 'sentry', label: 'Sentry', configured: true, tools: ['get_sentry_issue'] },
]

function respondWith(body, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })
}

describe('MainAgentForm', () => {
  beforeEach(() => {
    respondWith({ tools: null })
  })

  it('starts on "every tool" when no allowlist was ever saved', () => {
    render(
      <MainAgentForm
        token="tok"
        onLogout={vi.fn()}
        mainAgentTools={null}
        subagents={[]}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('checkbox', { name: /use every configured tool/i })).toBeChecked()
  })

  it('saves null while "every tool" stays on', async () => {
    const onSaved = vi.fn()
    render(
      <MainAgentForm
        token="tok"
        onLogout={vi.fn()}
        mainAgentTools={null}
        subagents={[]}
        toolGroups={TOOL_GROUPS}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /save tools/i }))

    expect(global.fetch.mock.calls[0][0]).toBe('/api/admin/agent/tools')
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ tools: null })
    expect(onSaved).toHaveBeenCalled()
  })

  it('saves the ticked tools once "every tool" is turned off', async () => {
    render(
      <MainAgentForm
        token="tok"
        onLogout={vi.fn()}
        mainAgentTools={['search_code', 'get_sentry_issue']}
        subagents={[]}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('checkbox', { name: /searching code/i }))
    await userEvent.click(screen.getByRole('button', { name: /save tools/i }))

    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ tools: ['get_sentry_issue'] })
  })

  it('disables the picker while every tool is allowed', () => {
    render(
      <MainAgentForm
        token="tok"
        onLogout={vi.fn()}
        mainAgentTools={null}
        subagents={[]}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('checkbox', { name: /searching code/i })).toBeDisabled()
  })

  it('marks a tool an exclusive subagent already owns', () => {
    render(
      <MainAgentForm
        token="tok"
        onLogout={vi.fn()}
        mainAgentTools={[]}
        subagents={[{ id: 1, name: 'code_investigator', tools: ['search_code'], exclusive: true, enabled: true }]}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('Taken by code_investigator')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /searching code/i })).toBeDisabled()
  })

  it('shows the error the API returned', async () => {
    respondWith({ error: 'Failed to save the main agent tools.' }, 500)
    render(
      <MainAgentForm
        token="tok"
        onLogout={vi.fn()}
        mainAgentTools={[]}
        subagents={[]}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /save tools/i }))

    expect(await screen.findByText('Failed to save the main agent tools.')).toBeInTheDocument()
  })

  it('clears a group whose remaining tools are ticked even though a subagent owns one', async () => {
    const owner = {
      id: 3,
      name: 'code_investigator',
      tools: ['get_file_contents'],
      exclusive: true,
      enabled: true,
    }
    render(
      <MainAgentForm
        token="tok"
        onLogout={vi.fn()}
        mainAgentTools={['search_code', 'get_sentry_issue']}
        subagents={[owner]}
        toolGroups={TOOL_GROUPS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const groupButton = screen.getAllByRole('button', { name: /clear|select all/i })[0]
    expect(groupButton).toHaveTextContent(/clear/i)

    await userEvent.click(groupButton)
    await userEvent.click(screen.getByRole('button', { name: /save tools/i }))

    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ tools: ['get_sentry_issue'] })
  })
})
