import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import GithubAutoApprove from './GithubAutoApprove.jsx'

const BASE = '/api/admin/config/jev'

function okResponse(data) {
  return { ok: true, status: 200, json: async () => data }
}

function mockApi(repos, overrides = {}) {
  const document = { id: 'auto-approve', rev: 2, data: { repos }, setVersion: 0, savedAt: null, savedBy: null }
  const responses = {
    [`${BASE}/documents/auto-approve`]: okResponse(document),
    '/api/repos': okResponse({ repos: [{ fullName: 'acme/api' }] }),
    ...overrides,
  }
  global.fetch = vi.fn(async url => responses[url])
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('GithubAutoApprove', () => {
  it('shows the repos, the save bar and how REVIEW.md picks the guards', async () => {
    mockApi([])

    render(
      <MemoryRouter>
        <GithubAutoApprove token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )

    expect(await screen.findByText('Auto-approve repos', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByText(/A repo is checked by the guards its/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Admin → Guards' })).toHaveAttribute('href', '/admin/guards')
    expect(screen.getByText('Auto-approve repos', { selector: 'strong' })).toBeInTheDocument()

    await userEvent.setup().type(screen.getByRole('combobox', { name: 'Repository to add' }), 'api')
    expect(await screen.findByRole('option', { name: 'acme/api' })).toBeInTheDocument()
  })

  it('saves the repos and their modes', async () => {
    mockApi([{ name: 'acme/web', mode: 'off' }])
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <GithubAutoApprove token="tok" onLogout={vi.fn()} />
      </MemoryRouter>
    )
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Mode of acme/web' }), 'shadow')
    await user.click(screen.getByRole('button', { name: /^Save/ }))

    const put = global.fetch.mock.calls.find(([, options]) => options?.method === 'PUT')
    expect(put[0]).toBe(`${BASE}/documents/auto-approve`)
    expect(JSON.parse(put[1].body).data).toEqual({ repos: [{ name: 'acme/web', mode: 'shadow' }] })
  })

  it('shows why the repos could not load', async () => {
    mockApi([], {
      [`${BASE}/documents/auto-approve`]: {
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
