import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import GuardEditor from './GuardEditor.jsx'

const BASE = '/api/admin/config/jev'
const CATALOG = { keyConfigured: true, models: [{ name: 'jev-latest', description: '' }], scannedAt: null }
const QUESTION = { id: 'q1', type: 'noul', text: 'Is it risky?', instructions: '', criteria: '', flagAt: 60 }
const SET = {
  description: 'Replies to customers',
  model: 'jev-latest',
  minConfidence: 0.75,
  timeoutSeconds: 30,
  dailyLimit: 0,
  questions: [QUESTION],
}
const NO_ROWS = { entries: [], total: 0, page: 1, pageSize: 5 }
const LEGAL = { id: 'legal', name: 'Legal', builtIn: true }
const GITHUB = { id: 'github', name: 'GitHub PRs', builtIn: true }
const REFUNDS = { id: 'guard-0a1b2c3d', name: 'Refunds', builtIn: false }

function okResponse(data) {
  return { ok: true, status: 200, json: async () => data }
}

function document(id, data) {
  return { id, rev: 2, data, setVersion: 1, savedAt: null, savedBy: null }
}

function mockApi(id, data, routes = {}) {
  const handlers = {
    [`GET ${BASE}/documents/${id}`]: [okResponse(document(id, data))],
    [`GET ${BASE}/documents/${id}/versions?page=1`]: [okResponse(NO_ROWS)],
    [`GET ${BASE}/documents/${id}/history?page=1`]: [okResponse(NO_ROWS)],
    ...routes,
  }
  global.fetch = vi.fn(async (url, options = {}) => {
    const responses = handlers[`${options.method ?? 'GET'} ${url}`]
    if (!responses) throw new Error(`Unexpected request: ${options.method ?? 'GET'} ${url}`)
    return responses.length > 1 ? responses.shift() : responses[0]
  })
}

function renderEditor(guard, props = {}) {
  const handlers = { onSaved: vi.fn(), onDeleted: vi.fn(), onLogout: vi.fn(), ...props }
  render(
    <MemoryRouter>
      <GuardEditor token="tok" guard={guard} catalog={CATALOG} {...handlers} />
    </MemoryRouter>
  )
  return handlers
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('GuardEditor', () => {
  it('edits a built-in guard: how to ask for it, sending, its questions, versions and history', async () => {
    mockApi('legal', { set: SET, allowSend: false })

    renderEditor(LEGAL)

    expect(await screen.findByText('Legal guard', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByText('A built-in guard: it cannot be renamed or deleted.')).toBeInTheDocument()
    expect(screen.getByText(/pass the reply through the Legal guard/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Allow sending replies from Soporti/ })).not.toBeChecked()
    expect(screen.getByLabelText('When to use it')).toHaveValue('Replies to customers')
    expect(await screen.findByText('No versions yet. The first save creates version 1.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete…' })).not.toBeInTheDocument()
  })

  it('saves the sending switch and refreshes the list of guards', async () => {
    const saved = document('legal', { set: SET, allowSend: true })
    mockApi('legal', { set: SET, allowSend: false }, { [`PUT ${BASE}/documents/legal`]: [okResponse(saved)] })
    const user = userEvent.setup()
    const { onSaved } = renderEditor(LEGAL)

    await user.click(await screen.findByRole('checkbox', { name: /Allow sending replies from Soporti/ }))
    await user.click(screen.getByRole('button', { name: 'Save (v2 → v3)' }))

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    const put = global.fetch.mock.calls.find(([, options = {}]) => options.method === 'PUT')
    expect(JSON.parse(put[1].body).data.allowSend).toBe(true)
  })

  it('shows the GitHub guard without sending, pointing to the repos and naming the repos that use its set', async () => {
    mockApi('github', {
      set: { ...SET, maxCharacters: 100_000, rules: [] },
      repos: [
        { name: 'acme/web', mode: 'shadow', jev: true, denylist: [] },
        { name: 'acme/docs', mode: 'off', jev: true, denylist: [] },
      ],
    })
    const user = userEvent.setup()

    renderEditor(GITHUB)

    expect(await screen.findByRole('link', { name: 'Admin → GitHub' })).toHaveAttribute('href', '/admin/github')
    expect(screen.queryByRole('checkbox', { name: /Allow sending/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Set description')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete set' }))

    expect(screen.getByText(/Cannot delete the set: 1 auto-approve repo \(acme\/web\) use it/)).toBeInTheDocument()
  })

  it('renames a guard of your own', async () => {
    mockApi('guard-0a1b2c3d', { name: 'Refunds', set: SET, allowSend: false })
    const user = userEvent.setup()

    renderEditor(REFUNDS)
    const name = await screen.findByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'Chargebacks')

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('deletes a guard of your own after a confirmation', async () => {
    mockApi(
      'guard-0a1b2c3d',
      { name: 'Refunds', set: SET, allowSend: false },
      { [`DELETE ${BASE}/guards/guard-0a1b2c3d`]: [{ ok: true, status: 204, json: async () => ({}) }] }
    )
    const user = userEvent.setup()
    const { onDeleted } = renderEditor(REFUNDS)

    await user.click(await screen.findByRole('button', { name: 'Delete…' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Delete…' }))
    expect(screen.getByText('Delete the Refunds guard? Its cases stay in their conversations.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete guard' }))

    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
  })

  it('shows why the guard could not load', async () => {
    mockApi('legal', null, {
      [`GET ${BASE}/documents/legal`]: [{ ok: false, status: 500, json: async () => ({ error: 'Failed to load.' }) }],
    })

    renderEditor(LEGAL)

    expect(await screen.findByText('Failed to load.')).toBeInTheDocument()
  })
})
