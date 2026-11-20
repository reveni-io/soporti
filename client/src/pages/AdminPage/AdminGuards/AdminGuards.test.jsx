import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    [`GET ${BASE}/documents/${id}/history?page=1`]: [okResponse(NO_ROWS)],
  }
}

function mockApi(routes = {}) {
  const handlers = {
    [`GET ${BASE}`]: [okResponse({ keyConfigured: true, models: [], scannedAt: null })],
    [`GET ${BASE}/guards`]: [okResponse({ guards: [LEGAL, GITHUB] })],
    ...documentRoutes('legal', { set: SET, allowSend: false }),
    ...documentRoutes('jev', { enabled: true }),
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
  it('starts with Jev, then the guards, editing Legal first, and ends with the Jev history', async () => {
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

    expect(await screen.findByRole('button', { name: 'Edit Legal' })).toBeDisabled()
    expect(await screen.findByText('Legal guard', { selector: 'h2' })).toBeInTheDocument()
    const titles = [...document.querySelectorAll('h2')].map(title => title.textContent)
    expect(titles[0]).toBe('Jev')
    expect(titles.indexOf('Guards')).toBeLessThan(titles.indexOf('Legal guard'))
    expect(titles.at(-1)).toBe('Jev history')
    expect(screen.queryByRole('textbox', { name: 'Name of the new guard' })).not.toBeInTheDocument()
  })

  it('opens the guard named in the address and switches guards', async () => {
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

    expect(await screen.findByText('GitHub PRs guard', { selector: 'h2' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit Legal' }))

    expect(screen.getByTestId('search')).toHaveTextContent('?guard=legal')
    expect(await screen.findByText('Legal guard', { selector: 'h2' })).toBeInTheDocument()
  })

  it('reloads the Jev history once the key changes', async () => {
    mockApi({
      [`PUT ${BASE}/api-key`]: [okResponse({ keyConfigured: true })],
      [`GET ${BASE}/documents/jev/history?page=1`]: [
        okResponse(NO_ROWS),
        okResponse({
          entries: [
            { at: '2026-11-20T10:00:00.000Z', author: 'ana@example.com', change: 'API key replaced', rev: null },
          ],
          total: 1,
          page: 1,
          pageSize: 5,
        }),
      ],
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
    await user.type(await screen.findByPlaceholderText('Paste a new key to replace it'), 'jev-secret')
    await user.click(screen.getByRole('button', { name: 'Save key' }))

    expect(await screen.findByText('API key replaced')).toBeInTheDocument()
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
