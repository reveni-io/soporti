import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import GuardEditor from './GuardEditor.jsx'

const BASE = '/api/admin/config/jev'
const QUESTION = { id: 'q1', type: 'noul', text: 'Is it risky?', flagAt: 60 }
const SET = {
  model: 'jev-latest',
  minConfidence: 0.75,
  timeoutSeconds: 30,
  dailyLimit: 0,
  questions: [QUESTION],
}
const NO_ROWS = { entries: [], total: 0, page: 1, pageSize: 5 }
const LEGAL = { id: 'legal', name: 'Legal' }
const PAYMENTS = { id: 'guard-0a1b2c3d', name: 'Payments' }

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
  it('edits a guard: how to ask for it, its questions and versions, with no switches', async () => {
    mockApi('legal', { set: SET })

    render(
      <MemoryRouter>
        <GuardEditor token="tok" guard={LEGAL} onSaved={vi.fn()} onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(await screen.findByText('Legal guard', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByText(/use the Legal guards/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Allow/ })).not.toBeInTheDocument()
    expect(await screen.findByText('No versions yet. The first save creates version 1.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Legal')
    expect(screen.getByText(/when a repo’s/)).toBeInTheDocument()
  })

  it('saves the guard and refreshes the list of guards', async () => {
    const saved = document('legal', { name: 'Legal Review', set: SET })
    mockApi('legal', { set: SET }, { [`PUT ${BASE}/documents/legal`]: [okResponse(saved)] })
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(
      <MemoryRouter>
        <GuardEditor token="tok" guard={LEGAL} onSaved={onSaved} onLogout={vi.fn()} />
      </MemoryRouter>
    )

    await user.type(await screen.findByRole('textbox', { name: 'Name' }), ' Review')
    await user.click(screen.getByRole('button', { name: 'Save (v2 → v3)' }))

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    const put = global.fetch.mock.calls.find(([, options = {}]) => options.method === 'PUT')
    expect(JSON.parse(put[1].body).data.name).toBe('Legal Review')
  })

  it('renames a guard', async () => {
    mockApi('guard-0a1b2c3d', { name: 'Payments', set: SET })
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <GuardEditor token="tok" guard={PAYMENTS} onSaved={vi.fn()} onLogout={vi.fn()} />
      </MemoryRouter>
    )

    const name = await screen.findByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'Refunds')

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete guard/ })).not.toBeInTheDocument()
  })

  it('closes at once without changes, and asks before dropping unsaved ones', async () => {
    mockApi('legal', { set: SET })
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <GuardEditor token="tok" guard={LEGAL} onSaved={vi.fn()} onClose={onClose} onLogout={vi.fn()} />
      </MemoryRouter>
    )
    await user.click(await screen.findByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)

    await user.type(screen.getByRole('textbox', { name: 'Name' }), ' Review')
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
        <GuardEditor token="tok" guard={LEGAL} onSaved={vi.fn()} onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(await screen.findByText('Failed to load.')).toBeInTheDocument()
  })
})
