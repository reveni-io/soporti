import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AutoApproveRepos from './AutoApproveRepos.jsx'

const WEB = { name: 'acme/web', mode: 'off', jev: true, denylist: [] }
const DOCS = { name: 'acme/docs', mode: 'shadow', jev: true, denylist: ['docs/legal/**', ''] }

function reposState(repos = [WEB, DOCS], saved = repos) {
  return { document: { data: { repos: saved } }, draft: { repos }, updateDraft: vi.fn() }
}

function lastRepos(state) {
  return state.updateDraft.mock.calls.at(-1)[0](state.draft).repos
}

function respond(status, body) {
  return { ok: status < 400, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AutoApproveRepos', () => {
  it('lists each repo with its behaviour and its own denylist', () => {
    render(
      <AutoApproveRepos
        token="tok"
        state={reposState([WEB, DOCS, { ...DOCS, name: 'acme/api', mode: 'on', jev: false }])}
        onLogout={vi.fn()}
      />
    )

    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getByText('Not evaluated')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Logs but does not decide')).toBeInTheDocument()
    expect(within(rows[2]).getByText('1 pattern')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Decides as today (Jev off)')).toBeInTheDocument()
    expect(screen.getByText(/Repos not in this list keep today’s behaviour/)).toBeInTheDocument()
  })

  it('says when no repo has auto-approve yet', () => {
    render(<AutoApproveRepos token="tok" state={reposState([])} onLogout={vi.fn()} />)

    expect(screen.getByText('No repo has auto-approve yet.')).toBeInTheDocument()
  })

  it('keeps on out of reach until the repo is saved in shadow', () => {
    render(<AutoApproveRepos token="tok" state={reposState()} onLogout={vi.fn()} />)

    expect(
      within(screen.getByRole('combobox', { name: 'Mode of acme/web' })).getByRole('option', { name: 'on' })
    ).toBeDisabled()
    expect(
      within(screen.getByRole('combobox', { name: 'Mode of acme/docs' })).getByRole('option', { name: 'on' })
    ).toBeEnabled()
  })

  it('changes a mode below on without asking', async () => {
    const state = reposState()
    const user = userEvent.setup()

    render(<AutoApproveRepos token="tok" state={state} onLogout={vi.fn()} />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Mode of acme/web' }), 'shadow')

    expect(lastRepos(state)[0]).toEqual({ ...WEB, mode: 'shadow' })
  })

  it('asks for confirmation with the shadow results before turning repos on, and explains the ones that must wait', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(respond(200, { repos: [{ repo: 'acme/docs', evaluated: 96, wouldApprove: 40, days: 14 }] }))
    const state = reposState()
    const user = userEvent.setup()

    render(<AutoApproveRepos token="tok" state={state} onLogout={vi.fn()} />)
    await user.click(screen.getByRole('checkbox', { name: 'Select all repos' }))
    expect(screen.getByText('2 of 2 selected.')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Set mode to' }), 'on')
    await user.click(screen.getByRole('button', { name: 'Apply to 2 repos' }))

    expect(
      screen.getByText(
        /Shadow first: acme\/web has not been saved in shadow yet\..*The other selected repos can go on\./
      )
    ).toBeInTheDocument()
    expect(await screen.findByText('40 (42%)')).toBeInTheDocument()
    expect(global.fetch.mock.calls[0][0]).toContain('/api/admin/config/jev/github/shadow-stats?repos=acme%2Fdocs')

    await user.click(screen.getByRole('button', { name: 'Set to on' }))

    expect(lastRepos(state).map(repo => repo.mode)).toEqual(['off', 'on'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancels turning a repo on', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(200, { repos: [] }))
    const state = reposState()
    const user = userEvent.setup()

    render(<AutoApproveRepos token="tok" state={state} onLogout={vi.fn()} />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Mode of acme/docs' }), 'on')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(state.updateDraft).not.toHaveBeenCalled()
  })

  it('turns Jev off for a repo and removes a repo', async () => {
    const state = reposState()
    const user = userEvent.setup()

    render(<AutoApproveRepos token="tok" state={state} onLogout={vi.fn()} />)
    await user.click(screen.getByRole('checkbox', { name: 'Ask Jev about acme/web' }))
    expect(lastRepos(state)[0].jev).toBe(false)

    await user.click(screen.getByRole('checkbox', { name: 'Select acme/docs' }))
    await user.click(screen.getByRole('button', { name: 'Remove acme/docs' }))
    expect(lastRepos(state)).toEqual([WEB])
    expect(screen.getByText(/Select repos, or all of them/)).toBeInTheDocument()
  })

  it('adds a repo the GitHub token can read, in off', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(200, { fullName: 'acme/api' }))
    const state = reposState()
    const user = userEvent.setup()

    render(<AutoApproveRepos token="tok" state={state} onLogout={vi.fn()} />)
    await user.type(screen.getByRole('textbox', { name: 'Repository to add' }), 'acme/API')
    await user.click(screen.getByRole('button', { name: 'Add repo' }))

    expect(lastRepos(state).at(-1)).toEqual({ name: 'acme/api', mode: 'off', jev: true, denylist: [] })
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ name: 'acme/API' })
    expect(screen.getByRole('textbox', { name: 'Repository to add' })).toHaveValue('')
  })

  it.each([
    ['acme', 'Use the org/repo format, e.g. acme/docs.'],
    ['ACME/web', 'ACME/web is already in the list.'],
  ])('refuses to add %s', async (name, error) => {
    global.fetch = vi.fn()
    const user = userEvent.setup()

    render(<AutoApproveRepos token="tok" state={reposState()} onLogout={vi.fn()} />)
    await user.type(screen.getByRole('textbox', { name: 'Repository to add' }), name)
    await user.click(screen.getByRole('button', { name: 'Add repo' }))

    expect(screen.getByText(error)).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('shows why the token cannot read a repo', async () => {
    const error = 'The CI token cannot read acme/secret. Give the token read access to the repo, or check the name.'
    global.fetch = vi.fn().mockResolvedValue(respond(422, { error }))
    const user = userEvent.setup()

    render(<AutoApproveRepos token="tok" state={reposState()} onLogout={vi.fn()} />)
    await user.type(screen.getByRole('textbox', { name: 'Repository to add' }), 'acme/secret')
    await user.click(screen.getByRole('button', { name: 'Add repo' }))

    expect(await screen.findByText(error)).toBeInTheDocument()
  })

  it('logs out when the session expired while adding a repo', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(401, {}))
    const onLogout = vi.fn()
    const user = userEvent.setup()

    render(<AutoApproveRepos token="tok" state={reposState()} onLogout={onLogout} />)
    await user.type(screen.getByRole('textbox', { name: 'Repository to add' }), 'acme/api')
    await user.click(screen.getByRole('button', { name: 'Add repo' }))

    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})
