import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

function mockApi(repos, overrides = {}) {
  const document = { id: 'github', rev: 2, data: { set: SET, repos }, setVersion: 1, savedAt: null, savedBy: null }
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

describe('GithubAutoApprove', () => {
  it('shows the question editor, the versions, the history and the project save bar', async () => {
    mockApi([])

    render(<GithubAutoApprove token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Questions and answers for this review')).toBeInTheDocument()
    expect(await screen.findByText('No versions yet. The first save creates version 1.')).toBeInTheDocument()
    expect(await screen.findByText('No changes yet.')).toBeInTheDocument()
    expect(screen.getByText('GitHub review project')).toBeInTheDocument()
  })

  it('names the repos that still use the set when deleting it', async () => {
    mockApi([
      { name: 'acme/web', mode: 'shadow', jev: true, denylist: [] },
      { name: 'acme/docs', mode: 'off', jev: true, denylist: [] },
    ])
    const user = userEvent.setup()

    render(<GithubAutoApprove token="tok" onLogout={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Delete set' }))

    expect(
      screen.getByText('Cannot delete the set: 1 auto-approve repo (acme/web) use it. Set them to off and save first.')
    ).toBeInTheDocument()
  })

  it('shows why the project could not load', async () => {
    mockApi([], {
      [`${BASE}/documents/github`]: {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Failed to load the settings.' }),
      },
    })

    render(<GithubAutoApprove token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Failed to load the settings.')).toBeInTheDocument()
  })
})
