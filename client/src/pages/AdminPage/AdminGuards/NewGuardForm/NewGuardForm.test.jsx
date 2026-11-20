import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewGuardForm from './NewGuardForm.jsx'

function respond(status, body) {
  return { ok: status < 400, status, json: async () => body }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NewGuardForm', () => {
  it('creates a guard with the name and hands it over', async () => {
    const guard = { id: 'guard-0a1b2c3d', name: 'Refunds' }
    global.fetch = vi.fn(async () => respond(201, { guard }))
    const onCreated = vi.fn()
    const user = userEvent.setup()
    render(<NewGuardForm token="tok" onLogout={vi.fn()} onCreated={onCreated} />)
    const create = screen.getByRole('button', { name: 'New guard' })

    expect(create).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Name of the new guard' }), ' Refunds ')
    await user.click(create)

    expect(onCreated).toHaveBeenCalledWith(guard)
    expect(screen.getByRole('textbox', { name: 'Name of the new guard' })).toHaveValue('')
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/admin/config/jev/guards')
    expect(JSON.parse(options.body)).toEqual({ name: 'Refunds' })
  })

  it('shows why the guard could not be created', async () => {
    global.fetch = vi.fn(async () => respond(422, { error: 'There is already a guard called Legal.' }))
    const onCreated = vi.fn()
    const user = userEvent.setup()
    render(<NewGuardForm token="tok" onLogout={vi.fn()} onCreated={onCreated} />)

    await user.type(screen.getByRole('textbox', { name: 'Name of the new guard' }), 'legal')
    await user.click(screen.getByRole('button', { name: 'New guard' }))

    expect(await screen.findByText('There is already a guard called Legal.')).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
  })
})
