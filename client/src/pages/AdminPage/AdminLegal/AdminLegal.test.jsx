import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminLegal from './AdminLegal.jsx'

const BASE = '/api/admin/config/jev'
const QUESTION = {
  id: 'l1',
  type: 'noul',
  text: 'The reply promises a refund',
  instructions: '',
  criteria: '',
  flagAt: 60,
}
const SET = {
  description: '',
  model: 'jev-1.13.0',
  minConfidence: 0.7,
  timeoutSeconds: 30,
  dailyLimit: 0,
  questions: [QUESTION],
}
const EMPTY_PAGE = { entries: [], total: 0, page: 1, pageSize: 5 }

function okResponse(data) {
  return { ok: true, status: 200, json: async () => data }
}

function mockApi({ keyConfigured = true, enabled = true, questions = [QUESTION], usage = {} } = {}) {
  const responses = {
    [BASE]: okResponse({ keyConfigured, models: [{ name: 'jev-1.13.0', description: '' }], scannedAt: null }),
    [`${BASE}/documents/legal`]: okResponse({
      id: 'legal',
      rev: 2,
      data: { set: { ...SET, questions } },
      setVersion: 3,
      savedAt: null,
      savedBy: null,
    }),
    [`${BASE}/documents/jev`]: okResponse({ id: 'jev', rev: 1, data: { enabled }, setVersion: 0 }),
    [`${BASE}/documents/legal/versions?page=1`]: okResponse({
      entries: [
        { version: 3, at: '2026-11-19T10:00:00Z', author: 'ana@example.com', change: 'Questions', calls: 1284 },
      ],
      total: 1,
      page: 1,
      pageSize: 5,
    }),
    [`${BASE}/documents/legal/history?page=1`]: okResponse(EMPTY_PAGE),
    [`${BASE}/legal/usage?page=1`]: okResponse({
      queriesOn: 1,
      checkedRuns: 27,
      uncheckedRuns: 0,
      unchecked: EMPTY_PAGE,
      ...usage,
    }),
  }
  global.fetch = vi.fn(async url => responses[url])
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AdminLegal', () => {
  it('is ready with the shared key, Jev calls on and a saved question', async () => {
    mockApi()

    render(<AdminLegal token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(screen.getByText('Shared, from the Jev section (configured)')).toBeInTheDocument()
    expect(screen.getByText('Legal. Jev only warns.')).toBeInTheDocument()
    expect(screen.getByText(/is below 0\.7/)).toBeInTheDocument()
    expect(await screen.findAllByText('1 scheduled query')).toHaveLength(2)
    expect(screen.getByText(/Review TypeSafe’s data retention/)).toBeInTheDocument()
    expect(screen.queryByText(/Legal needs the API key/)).not.toBeInTheDocument()
  })

  it('explains what is missing when it is not ready', async () => {
    mockApi({ keyConfigured: false, enabled: false, questions: [] })

    render(<AdminLegal token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not ready')).toBeInTheDocument()
    expect(screen.getByText(/Legal needs the API key and Jev calls turned on/)).toBeInTheDocument()
    expect(screen.getByText('Shared, from the Jev section (not configured)')).toBeInTheDocument()
  })

  it('edits the questions with the answers that warn Legal and shows the calls of each version', async () => {
    mockApi()

    render(<AdminLegal token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('warns Legal at 60 or more')).toBeInTheDocument()
    expect(await screen.findByRole('columnheader', { name: 'Calls that used it' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: (1284).toLocaleString() })).toBeInTheDocument()
    expect(screen.getByText('Legal project')).toBeInTheDocument()
  })

  it('names the queries that still use the set when deleting it', async () => {
    mockApi({ usage: { queriesOn: 3 } })
    const user = userEvent.setup()

    render(<AdminLegal token="tok" onLogout={vi.fn()} />)
    expect(await screen.findAllByText('3 scheduled queries')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Delete set' }))

    expect(
      screen.getByText('Cannot delete the set: 3 scheduled queries have Legal review on. They must turn it off first.')
    ).toBeInTheDocument()
  })

  it('shows why the Legal settings could not load', async () => {
    mockApi()
    const responses = global.fetch
    global.fetch = vi.fn(async url =>
      url === `${BASE}/documents/legal`
        ? { ok: false, status: 500, json: async () => ({ error: 'Failed to load the settings.' }) }
        : responses(url)
    )

    render(<AdminLegal token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Failed to load the settings.')).toBeInTheDocument()
  })
})
