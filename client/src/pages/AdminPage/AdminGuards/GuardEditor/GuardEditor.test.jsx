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
const LEGAL = { id: 'legal', name: 'Legal' }
const GITHUB = { id: 'github', name: 'GitHub PRs' }

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

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('GuardEditor', () => {
  it('edits a guard: how to ask for it, sending, its questions, versions and history', async () => {
    mockApi('legal', { set: SET, allowSend: false })

    render(
      <MemoryRouter>
        <GuardEditor token="tok" guard={LEGAL} catalog={CATALOG} onSaved={vi.fn()} onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(await screen.findByText('Legal guard', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByText(/pass the reply through the Legal guard/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Allow sending replies from Soporti/ })).not.toBeChecked()
    expect(screen.getByLabelText('When to use it')).toHaveValue('Replies to customers')
    expect(await screen.findByText('No versions yet. The first save creates version 1.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()
  })

  it('turns the Jev calls of the guard on and saves them with it', async () => {
    const saved = document('legal', { enabled: true, set: SET, allowSend: false })
    mockApi(
      'legal',
      { enabled: false, set: SET, allowSend: false },
      { [`PUT ${BASE}/documents/legal`]: [okResponse(saved)] }
    )
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GuardEditor token="tok" guard={LEGAL} catalog={CATALOG} onSaved={vi.fn()} onLogout={vi.fn()} />
      </MemoryRouter>
    )

    const calls = await screen.findByRole('checkbox', { name: /Allow Jev calls/ })
    expect(screen.getByText(/the guard is not offered in the chat/)).toBeInTheDocument()
    await user.click(calls)
    await user.click(screen.getByRole('button', { name: 'Save (v2 → v3)' }))

    const put = global.fetch.mock.calls.find(([, options = {}]) => options.method === 'PUT')
    expect(JSON.parse(put[1].body).data.enabled).toBe(true)
  })

  it('locks the Jev calls off until an API key is saved', async () => {
    mockApi('legal', { enabled: false, set: SET, allowSend: false })

    render(
      <MemoryRouter>
        <GuardEditor
          token="tok"
          guard={LEGAL}
          catalog={{ ...CATALOG, keyConfigured: false }}
          onSaved={vi.fn()}
          onLogout={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(await screen.findByRole('checkbox', { name: /Allow Jev calls/ })).toBeDisabled()
    expect(
      screen.getByText('Save the Jev API key in the Jev section of this page before turning the calls on.')
    ).toBeInTheDocument()
  })

  it('saves the sending switch and refreshes the list of guards', async () => {
    const saved = document('legal', { set: SET, allowSend: true })
    mockApi('legal', { set: SET, allowSend: false }, { [`PUT ${BASE}/documents/legal`]: [okResponse(saved)] })
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(
      <MemoryRouter>
        <GuardEditor token="tok" guard={LEGAL} catalog={CATALOG} onSaved={onSaved} onLogout={vi.fn()} />
      </MemoryRouter>
    )

    await user.click(await screen.findByRole('checkbox', { name: /Allow sending replies from Soporti/ }))
    await user.click(screen.getByRole('button', { name: 'Save (v2 → v3)' }))

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    const put = global.fetch.mock.calls.find(([, options = {}]) => options.method === 'PUT')
    expect(JSON.parse(put[1].body).data.allowSend).toBe(true)
  })

  it('shows the GitHub guard with its rules and denylists, without sending, and names the repos that use its set', async () => {
    mockApi('github', {
      set: { ...SET, maxCharacters: 100_000, rules: [{ id: 'denylist', role: 'veto' }] },
      repos: [
        { name: 'acme/web', mode: 'shadow', jev: true, denylist: ['src/payments/**'] },
        { name: 'acme/docs', mode: 'off', jev: true, denylist: [] },
      ],
    })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <GuardEditor token="tok" guard={GITHUB} catalog={CATALOG} onSaved={vi.fn()} onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(await screen.findByRole('link', { name: 'Admin → GitHub' })).toHaveAttribute('href', '/admin/github')
    expect(screen.getByText(/only a trivial PR with nothing blocking is approved/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Allow sending/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Set description')).toBeInTheDocument()
    expect(screen.getByText('Rules', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByText('Denylist', { selector: '.review-rules__name' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('src/payments/**')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete set' }))

    expect(screen.getByText(/Cannot delete the set: 1 auto-approve repo \(acme\/web\) use it/)).toBeInTheDocument()
  })

  it('closes at once without changes, and asks before dropping unsaved ones', async () => {
    mockApi('legal', { set: SET, allowSend: false })
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <GuardEditor
          token="tok"
          guard={LEGAL}
          catalog={CATALOG}
          onSaved={vi.fn()}
          onClose={onClose}
          onLogout={vi.fn()}
        />
      </MemoryRouter>
    )
    await user.click(await screen.findByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('checkbox', { name: /Allow sending replies from Soporti/ }))
    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('group', { name: 'Unsaved changes' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))

    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows why the guard could not load', async () => {
    mockApi('legal', null, {
      [`GET ${BASE}/documents/legal`]: [{ ok: false, status: 500, json: async () => ({ error: 'Failed to load.' }) }],
    })

    render(
      <MemoryRouter>
        <GuardEditor token="tok" guard={LEGAL} catalog={CATALOG} onSaved={vi.fn()} onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(await screen.findByText('Failed to load.')).toBeInTheDocument()
  })
})
