import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    ...overrides,
  }
  global.fetch = vi.fn(async url => responses[url])
}

beforeEach(() => {
  vi.restoreAllMocks()
})

function renderAutoApprove() {
  render(
    <MemoryRouter>
      <GithubAutoApprove token="tok" onLogout={vi.fn()} />
    </MemoryRouter>
  )
}

describe('GithubAutoApprove', () => {
  it('shows the repos, the rules and the save bar, and points to the GitHub PRs guard for the questions', async () => {
    mockApi([])

    renderAutoApprove()

    expect(await screen.findByText('Auto-approve repos')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'GitHub PRs guard' })).toHaveAttribute('href', '/admin/guards?guard=github')
    expect(screen.getByText('Rules')).toBeInTheDocument()
    expect(screen.getByText('GitHub review project')).toBeInTheDocument()
    expect(screen.queryByText('Questions and answers for this review')).not.toBeInTheDocument()
  })

  it('shows why the project could not load', async () => {
    mockApi([], {
      [`${BASE}/documents/github`]: {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Failed to load the settings.' }),
      },
    })

    renderAutoApprove()

    expect(await screen.findByText('Failed to load the settings.')).toBeInTheDocument()
  })
})
