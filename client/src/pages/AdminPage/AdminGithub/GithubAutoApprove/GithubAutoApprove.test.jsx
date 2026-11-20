import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import GithubAutoApprove from './GithubAutoApprove.jsx'

const BASE = '/api/admin/config/jev'
const SET = {
  description: '',
  model: '',
  minConfidence: 0.75,
  timeoutSeconds: 30,
  dailyLimit: 0,
  maxCharacters: 100_000,
  questions: [],
  rules: [],
}

function okResponse(data) {
  return { ok: true, status: 200, json: async () => data }
}

function mockApi(repos, overrides = {}, set = SET) {
  const document = { id: 'github', rev: 2, data: { set, repos }, setVersion: 1, savedAt: null, savedBy: null }
  const page = { entries: [], total: 0, page: 1, pageSize: 5 }
  const responses = {
    [BASE]: okResponse({ keyConfigured: false, models: [], scannedAt: null }),
    [`${BASE}/documents/github`]: okResponse(document),
    [`${BASE}/documents/github/versions?page=1`]: okResponse(page),
    [`${BASE}/documents/github/history?page=1`]: okResponse(page),
    '/api/repos': okResponse({ repos: [{ fullName: 'acme/api' }] }),
    ...overrides,
  }
  global.fetch = vi.fn(async url => responses[url])
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('GithubAutoApprove', () => {
  it('shows the repos and the save bar, and points to the GitHub PRs guard for the questions and rules', async () => {
    mockApi([])

    render(
      <MemoryRouter>
        <GithubAutoApprove token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(await screen.findByText('Auto-approve repos')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'GitHub PRs guard' })).toHaveAttribute('href', '/admin/guards?guard=github')
    expect(screen.getByText('GitHub review project')).toBeInTheDocument()
    expect(screen.queryByText('Rules')).not.toBeInTheDocument()
    expect(screen.queryByText('Questions for this review')).not.toBeInTheDocument()
    expect(await screen.findByText(/Save the Jev API key in Admin → Guards/)).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('option[value="acme/api"]')).toBeInTheDocument())
  })

  it('saves only the repos, leaving the guard settings to the Guards section', async () => {
    mockApi([{ name: 'acme/web', mode: 'off', jev: false, denylist: [] }], {}, { ...SET, minConfidence: null })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <GithubAutoApprove token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Mode of acme/web' }), 'shadow')
    await user.click(screen.getByRole('button', { name: /^Save/ }))

    const put = global.fetch.mock.calls.find(([, options]) => options?.method === 'PUT')
    expect(JSON.parse(put[1].body).data).toEqual({
      repos: [{ name: 'acme/web', mode: 'shadow', jev: false, denylist: [] }],
    })
  })

  it('shows why the project could not load', async () => {
    mockApi([], {
      [`${BASE}/documents/github`]: {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Failed to load the settings.' }),
      },
    })

    render(
      <MemoryRouter>
        <GithubAutoApprove token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(await screen.findByText('Failed to load the settings.')).toBeInTheDocument()
  })
})
