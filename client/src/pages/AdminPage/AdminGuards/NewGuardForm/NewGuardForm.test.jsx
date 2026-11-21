import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewGuardForm from './NewGuardForm.jsx'

function respond(status, body) {
  return { ok: status < 400, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('NewGuardForm', () => {
  it('creates a guard with the name typed and hands its id over', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(201, { id: 'guard-0a1b2c3d', name: 'Legal Review' }))
    const onCreated = vi.fn()
    const user = userEvent.setup()

    render(<NewGuardForm token="tok" onLogout={vi.fn()} onCreated={onCreated} />)
    expect(screen.getByRole('button', { name: 'New guard' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Name of the new guard' }), 'Legal Review')
    await user.click(screen.getByRole('button', { name: 'New guard' }))

    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ name: 'Legal Review' })
    expect(onCreated).toHaveBeenCalledWith('guard-0a1b2c3d')
    expect(screen.getByRole('textbox', { name: 'Name of the new guard' })).toHaveValue('')
  })

  it('shows why the guard could not be created', async () => {
    const error = 'There is already a guard called "Legal". Pick another name.'
    global.fetch = vi.fn().mockResolvedValue(respond(409, { error }))
    const onCreated = vi.fn()
    const user = userEvent.setup()

    render(<NewGuardForm token="tok" onLogout={vi.fn()} onCreated={onCreated} />)
    await user.type(screen.getByRole('textbox', { name: 'Name of the new guard' }), 'Legal')
    await user.click(screen.getByRole('button', { name: 'New guard' }))

    expect(await screen.findByText(error)).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
  })
})
