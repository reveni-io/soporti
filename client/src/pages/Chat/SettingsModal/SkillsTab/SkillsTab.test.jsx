import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SkillsTab from './SkillsTab.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function makeStore(skills = [], overrides = {}) {
  return { skills, loading: false, error: null, reload: vi.fn(async () => {}), ...overrides }
}

describe('SkillsTab', () => {
  it('lists the skills from the store', async () => {
    const store = makeStore([{ id: 1, name: 'bug-triage', description: 'Triage bugs', instructions: 'x' }])

    render(<SkillsTab token="tok" onLogout={vi.fn()} skills={store} />)

    expect(screen.getByText('bug-triage')).toBeInTheDocument()
    expect(screen.getByText('Triage bugs')).toBeInTheDocument()
  })

  it('shows an empty state when there are no skills', () => {
    render(<SkillsTab token="tok" onLogout={vi.fn()} skills={makeStore([])} />)

    expect(screen.getByText('No skills yet.')).toBeInTheDocument()
  })

  it('shows a loading state while the store is loading', () => {
    render(<SkillsTab token="tok" onLogout={vi.fn()} skills={makeStore([], { loading: true })} />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('surfaces a load error from the store', () => {
    render(<SkillsTab token="tok" onLogout={vi.fn()} skills={makeStore([], { error: 'Failed to load skills' })} />)

    expect(screen.getByText('Failed to load skills')).toBeInTheDocument()
  })

  it('opens an empty form when clicking "+ New skill"', async () => {
    const user = userEvent.setup()

    render(<SkillsTab token="tok" onLogout={vi.fn()} skills={makeStore([])} />)

    await user.click(screen.getByRole('button', { name: '+ New skill' }))

    expect(screen.getByRole('button', { name: 'Create skill' })).toBeInTheDocument()
  })

  it('opens the form pre-filled when clicking Edit', async () => {
    const user = userEvent.setup()
    const store = makeStore([{ id: 1, name: 'bug-triage', description: '', instructions: 'Ask for repro' }])

    render(<SkillsTab token="tok" onLogout={vi.fn()} skills={store} />)

    await user.click(screen.getByRole('button', { name: 'Edit' }))

    expect(screen.getByDisplayValue('bug-triage')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('requires a two-step confirmation before deleting, then reloads the store', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    const user = userEvent.setup()
    const store = makeStore([{ id: 1, name: 'bug-triage', description: '', instructions: 'x' }])

    render(<SkillsTab token="tok" onLogout={vi.fn()} skills={store} />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(store.reload).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/skills/1')
    expect(options.method).toBe('DELETE')
    await waitFor(() => expect(store.reload).toHaveBeenCalledTimes(1))
  })

  it('calls onLogout when the delete returns 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onLogout = vi.fn()
    const user = userEvent.setup()
    const store = makeStore([{ id: 1, name: 'bug-triage', description: '', instructions: 'x' }])

    render(<SkillsTab token="tok" onLogout={onLogout} skills={store} />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(onLogout).toHaveBeenCalled())
    expect(store.reload).not.toHaveBeenCalled()
  })

  it('shows an error when the delete fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    const user = userEvent.setup()
    const store = makeStore([{ id: 1, name: 'bug-triage', description: '', instructions: 'x' }])

    render(<SkillsTab token="tok" onLogout={vi.fn()} skills={store} />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Failed to delete skill')).toBeInTheDocument()
  })

  it('returns to the list and reloads the store after saving', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ skill: { id: 1, name: 'bug-triage', description: '', instructions: 'x' } }),
    })
    const user = userEvent.setup()
    const store = makeStore([])

    render(<SkillsTab token="tok" onLogout={vi.fn()} skills={store} />)

    await user.click(screen.getByRole('button', { name: '+ New skill' }))
    await user.type(screen.getByPlaceholderText(/refund-policy/), 'bug-triage')
    await user.type(screen.getByLabelText('Instructions'), 'x')
    await user.click(screen.getByRole('button', { name: 'Create skill' }))

    await waitFor(() => expect(store.reload).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: '+ New skill' })).toBeInTheDocument()
  })

  it('cancels the delete confirmation without deleting', async () => {
    global.fetch = vi.fn()
    const user = userEvent.setup()
    const store = makeStore([{ id: 1, name: 'bug-triage', description: '', instructions: 'x' }])

    render(<SkillsTab token="tok" onLogout={vi.fn()} skills={store} />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
