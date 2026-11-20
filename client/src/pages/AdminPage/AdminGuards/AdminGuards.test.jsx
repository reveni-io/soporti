import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import AdminGuards from './AdminGuards.jsx'

const BASE = '/api/admin/config/jev'
const USAGE = { calls: 0, cases: 0, sentReplies: 0 }
const SET = { description: '', model: '', minConfidence: 0.75, timeoutSeconds: 30, dailyLimit: 0, questions: [] }
const NO_ROWS = { entries: [], total: 0, page: 1, pageSize: 5 }
const LEGAL = { id: 'legal', name: 'Legal', builtIn: true, description: '', questions: 0, model: '', usage: USAGE }
const REFUNDS = {
  id: 'guard-0a1b2c3d',
  name: 'Refunds',
  builtIn: false,
  description: '',
  questions: 0,
  model: '',
  usage: USAGE,
}

function okResponse(data) {
  return { ok: true, status: 200, json: async () => data }
}

function documentRoutes(id, data) {
  return {
    [`GET ${BASE}/documents/${id}`]: [okResponse({ id, rev: 1, data, setVersion: 0, savedAt: null, savedBy: null })],
    [`GET ${BASE}/documents/${id}/versions?page=1`]: [okResponse(NO_ROWS)],
    [`GET ${BASE}/documents/${id}/history?page=1`]: [okResponse(NO_ROWS)],
  }
}

function mockApi(routes = {}) {
  const handlers = {
    [`GET ${BASE}`]: [okResponse({ keyConfigured: true, models: [], scannedAt: null })],
    [`GET ${BASE}/guards`]: [okResponse({ guards: [LEGAL, REFUNDS] })],
    ...documentRoutes('legal', { set: SET, allowSend: false }),
    ...documentRoutes('jev', { enabled: true }),
    ...documentRoutes('guard-0a1b2c3d', { name: 'Refunds', set: SET, allowSend: false }),
    ...routes,
  }
  global.fetch = vi.fn(async (url, options = {}) => {
    const responses = handlers[`${options.method ?? 'GET'} ${url}`]
    if (!responses) throw new Error(`Unexpected request: ${options.method ?? 'GET'} ${url}`)
    return responses.length > 1 ? responses.shift() : responses[0]
  })
}

function SearchProbe() {
  return <span data-testid="search">{useLocation().search}</span>
}

function renderPage(path = '/admin/guards') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin/guards"
          element={
            <>
              <AdminGuards token="tok" onLogout={vi.fn()} />
              <SearchProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AdminGuards', () => {
  it('lists the guards, edits Legal first and holds the Jev connection', async () => {
    mockApi()

    renderPage()

    expect(await screen.findByRole('button', { name: 'Edit Legal' })).toBeDisabled()
    expect(await screen.findByText('Legal guard', { selector: 'h2' })).toBeInTheDocument()
    expect(await screen.findByText('Jev connection')).toBeInTheDocument()
  })

  it('opens the guard named in the address and switches guards', async () => {
    mockApi()
    const user = userEvent.setup()

    renderPage('/admin/guards?guard=guard-0a1b2c3d')

    expect(await screen.findByText('Refunds guard', { selector: 'h2' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit Legal' }))

    expect(screen.getByTestId('search')).toHaveTextContent('?guard=legal')
    expect(await screen.findByText('Legal guard', { selector: 'h2' })).toBeInTheDocument()
  })

  it('opens a new guard once it is created', async () => {
    const created = {
      id: 'guard-9f8e7d6c',
      name: 'Payments',
      builtIn: false,
      description: '',
      questions: 0,
      model: '',
      usage: USAGE,
    }
    mockApi({
      [`POST ${BASE}/guards`]: [{ ok: true, status: 201, json: async () => ({ guard: created }) }],
      [`GET ${BASE}/guards`]: [
        okResponse({ guards: [LEGAL, REFUNDS] }),
        okResponse({ guards: [LEGAL, REFUNDS, created] }),
      ],
      ...documentRoutes('guard-9f8e7d6c', { name: 'Payments', set: SET, allowSend: false }),
    })
    const user = userEvent.setup()

    renderPage()
    await user.type(await screen.findByRole('textbox', { name: 'Name of the new guard' }), 'Payments')
    await user.click(screen.getByRole('button', { name: 'New guard' }))

    expect(await screen.findByText('Payments guard', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByTestId('search')).toHaveTextContent('?guard=guard-9f8e7d6c')
  })

  it('goes back to Legal after deleting a guard', async () => {
    mockApi({
      [`DELETE ${BASE}/guards/guard-0a1b2c3d`]: [{ ok: true, status: 204, json: async () => ({}) }],
      [`GET ${BASE}/guards`]: [okResponse({ guards: [LEGAL, REFUNDS] }), okResponse({ guards: [LEGAL] })],
    })
    const user = userEvent.setup()

    renderPage('/admin/guards?guard=guard-0a1b2c3d')
    await user.click(await screen.findByRole('button', { name: 'Delete…' }))
    await user.click(screen.getByRole('button', { name: 'Delete guard' }))

    expect(await screen.findByText('Legal guard', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Refunds' })).not.toBeInTheDocument()
  })

  it('shows why the guards could not load', async () => {
    mockApi({
      [`GET ${BASE}/guards`]: [{ ok: false, status: 500, json: async () => ({ error: 'Failed to load the guards.' }) }],
    })

    renderPage()

    expect(await screen.findByText('Failed to load the guards.')).toBeInTheDocument()
  })
})
