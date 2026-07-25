import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SkillForm from './SkillForm.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('SkillForm', () => {
  it('disables submit until name and instructions are valid', async () => {
    const user = userEvent.setup()
    render(<SkillForm token="tok" onLogout={vi.fn()} skill={null} onSaved={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Create skill' })).toBeDisabled()

    await user.type(screen.getByPlaceholderText(/refund-policy/), 'bug-triage')
    expect(screen.getByRole('button', { name: 'Create skill' })).toBeDisabled()

    await user.type(screen.getByLabelText('Instructions'), 'Ask for repro steps.')
    expect(screen.getByRole('button', { name: 'Create skill' })).toBeEnabled()
  })

  it('shows a validation hint for an invalid name', async () => {
    const user = userEvent.setup()
    render(<SkillForm token="tok" onLogout={vi.fn()} skill={null} onSaved={vi.fn()} onCancel={vi.fn()} />)

    await user.type(screen.getByPlaceholderText(/refund-policy/), 'bug triage!')
    expect(screen.getByText(/lowercase letters, numbers, and hyphens/)).toBeInTheDocument()
  })

  it('creates a new skill via POST', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ skill: { id: 1, name: 'bug-triage', description: '', instructions: 'Ask for repro' } }),
    })
    const onSaved = vi.fn()
    const user = userEvent.setup()

    render(<SkillForm token="tok" onLogout={vi.fn()} skill={null} onSaved={onSaved} onCancel={vi.fn()} />)

    await user.type(screen.getByPlaceholderText(/refund-policy/), 'bug-triage')
    await user.type(screen.getByLabelText('Instructions'), 'Ask for repro')
    await user.click(screen.getByRole('button', { name: 'Create skill' }))

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/skills')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ name: 'bug-triage', description: '', instructions: 'Ask for repro' })
    expect(onSaved).toHaveBeenCalledWith({ id: 1, name: 'bug-triage', description: '', instructions: 'Ask for repro' })
  })

  it('edits an existing skill via PUT to its id, pre-filled', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ skill: { id: 7, name: 'bug-triage', description: '', instructions: 'Updated' } }),
    })
    const onSaved = vi.fn()
    const user = userEvent.setup()

    render(
      <SkillForm
        token="tok"
        onLogout={vi.fn()}
        skill={{ id: 7, name: 'bug-triage', description: '', instructions: 'Old text' }}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByDisplayValue('bug-triage')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Old text')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/skills/7')
    expect(options.method).toBe('PUT')
    expect(onSaved).toHaveBeenCalled()
  })

  it('shows the server error on a duplicate name (409)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'A skill with this name already exists.' }),
    })
    const user = userEvent.setup()

    render(<SkillForm token="tok" onLogout={vi.fn()} skill={null} onSaved={vi.fn()} onCancel={vi.fn()} />)

    await user.type(screen.getByPlaceholderText(/refund-policy/), 'bug-triage')
    await user.type(screen.getByLabelText('Instructions'), 'Ask for repro')
    await user.click(screen.getByRole('button', { name: 'Create skill' }))

    expect(await screen.findByText('A skill with this name already exists.')).toBeInTheDocument()
  })

  it('calls onLogout when saving returns 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onLogout = vi.fn()
    const user = userEvent.setup()

    render(<SkillForm token="tok" onLogout={onLogout} skill={null} onSaved={vi.fn()} onCancel={vi.fn()} />)

    await user.type(screen.getByPlaceholderText(/refund-policy/), 'bug-triage')
    await user.type(screen.getByLabelText('Instructions'), 'Ask for repro')
    await user.click(screen.getByRole('button', { name: 'Create skill' }))

    expect(onLogout).toHaveBeenCalled()
  })

  it('calls onCancel without saving', async () => {
    global.fetch = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()

    render(<SkillForm token="tok" onLogout={vi.fn()} skill={null} onSaved={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
