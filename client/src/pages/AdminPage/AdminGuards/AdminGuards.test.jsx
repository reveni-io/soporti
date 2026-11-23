import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import AdminGuards from './AdminGuards.jsx'

const BASE = '/api/admin/config/jev'
const USAGE = { calls: 0, cases: 0, sentReplies: 0 }
const SET = { description: '', model: '', minConfidence: 0.75, timeoutSeconds: 30, dailyLimit: 0, questions: [] }
const NO_ROWS = { entries: [], total: 0, page: 1, pageSize: 5 }
const LEGAL = { id: 'legal', name: 'Legal', description: '', questions: 0, model: '', usage: USAGE }
const GITHUB = { id: 'github', name: 'GitHub PRs', description: '', questions: 0, model: '', usage: USAGE }

function okResponse(data) {
  return { ok: true, status: 200, json: async () => data }
}

function documentRoutes(id, data) {
  return {
    [`GET ${BASE}/documents/${id}`]: [okResponse({ id, rev: 1, data, setVersion: 0, savedAt: null, savedBy: null })],
    [`GET ${BASE}/documents/${id}/versions?page=1`]: [okResponse(NO_ROWS)],
  }
}

function mockApi(routes = {}) {
  const handlers = {
    [`GET ${BASE}`]: [okResponse({ keyConfigured: true })],
    [`GET ${BASE}/guards`]: [okResponse({ guards: [LEGAL, GITHUB] })],
    ...documentRoutes('legal', { set: SET }),
    ...documentRoutes('github', { set: { ...SET, maxCharacters: 100_000, rules: [] }, repos: [] }),
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

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AdminGuards', () => {
  it('shows the Jev key and the guards, with no guard open and no history', async () => {
    mockApi()

    render(
      <MemoryRouter initialEntries={['/admin/guards']}>
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

    expect(await screen.findByRole('button', { name: 'Edit Legal' })).toBeEnabled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const titles = [...document.querySelectorAll('h2')].map(title => title.textContent)
    expect(titles).toEqual(['Jev', 'Guards'])
    expect(screen.getByRole('textbox', { name: 'Name of the new guard' })).toBeInTheDocument()
  })

  it('opens the guard named in the address in a modal, closes it and opens another', async () => {
    mockApi()
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/admin/guards?guard=github']}>
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

    expect(await screen.findByRole('dialog', { name: 'GitHub PRs guard' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('search')).toBeEmptyDOMElement()

    await user.click(screen.getByRole('button', { name: 'Edit Legal' }))

    expect(screen.getByTestId('search')).toHaveTextContent('?guard=legal')
    expect(await screen.findByRole('dialog', { name: 'Legal guard' })).toBeInTheDocument()
  })

  it('creates a guard and opens it', async () => {
    const payments = { ...LEGAL, id: 'guard-0a1b2c3d', name: 'Payments', builtIn: false }
    mockApi({
      [`GET ${BASE}/guards`]: [
        okResponse({ guards: [LEGAL, GITHUB] }),
        okResponse({ guards: [LEGAL, GITHUB, payments] }),
      ],
      [`POST ${BASE}/guards`]: [okResponse({ id: 'guard-0a1b2c3d', name: 'Payments' })],
      ...documentRoutes('guard-0a1b2c3d', { name: 'Payments', set: SET }),
    })
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/admin/guards']}>
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
    await user.type(await screen.findByRole('textbox', { name: 'Name of the new guard' }), 'Payments')
    await user.click(screen.getByRole('button', { name: 'New guard' }))

    expect(await screen.findByRole('dialog', { name: 'Payments guard' })).toBeInTheDocument()
    expect(screen.getByTestId('search')).toHaveTextContent('?guard=guard-0a1b2c3d')
  })

  it('deletes a created guard after a confirmation and shows the list again', async () => {
    const payments = { ...LEGAL, id: 'guard-0a1b2c3d', name: 'Payments', builtIn: false }
    mockApi({
      [`GET ${BASE}/guards`]: [okResponse({ guards: [LEGAL, payments] }), okResponse({ guards: [LEGAL] })],
      [`DELETE ${BASE}/guards/guard-0a1b2c3d`]: [{ ok: true, status: 204, json: async () => null }],
    })
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/admin/guards']}>
        <AdminGuards token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )
    await user.click(await screen.findByRole('button', { name: 'Delete Payments' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    await waitFor(() => expect(screen.queryByText('Payments')).not.toBeInTheDocument())
  })

  it('shows why the guards could not load', async () => {
    mockApi({
      [`GET ${BASE}/guards`]: [{ ok: false, status: 500, json: async () => ({ error: 'Failed to load the guards.' }) }],
    })

    render(
      <MemoryRouter initialEntries={['/admin/guards']}>
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

    expect(await screen.findByText('Failed to load the guards.')).toBeInTheDocument()
  })
})
