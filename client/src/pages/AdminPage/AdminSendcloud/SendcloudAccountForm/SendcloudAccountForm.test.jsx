import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SendcloudAccountForm from './SendcloudAccountForm.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('SendcloudAccountForm', () => {
  it('links the account with the trimmed fields, clears the keys and reloads the list', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ account: { id: 1 } }) })
    const onLinked = vi.fn()
    const user = userEvent.setup()

    render(<SendcloudAccountForm token="tok" onLogout={vi.fn()} onLinked={onLinked} />)

    await user.type(screen.getByLabelText('Account name'), '  Acme EU  ')
    await user.type(screen.getByLabelText('Public key'), ' public-key-123 ')
    await user.type(screen.getByLabelText('Secret key'), 'secret-key-456')
    await user.click(screen.getByRole('button', { name: /link account/i }))

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/admin/config/sendcloud/accounts')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      name: 'Acme EU',
      publicKey: 'public-key-123',
      secretKey: 'secret-key-456',
    })
    expect(onLinked).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Account name')).toHaveValue('')
    expect(screen.getByLabelText('Secret key')).toHaveValue('')
  })

  it('keeps the button disabled until every field is filled', async () => {
    const user = userEvent.setup()

    render(<SendcloudAccountForm token="tok" onLogout={vi.fn()} onLinked={vi.fn()} />)

    await user.type(screen.getByLabelText('Account name'), 'Acme EU')
    await user.type(screen.getByLabelText('Public key'), 'public-key-123')

    expect(screen.getByRole('button', { name: /link account/i })).toBeDisabled()
  })

  it('shows the error of a duplicate name and keeps what was typed', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'A Sendcloud account with this name already exists.' }),
    })
    const onLinked = vi.fn()
    const user = userEvent.setup()

    render(<SendcloudAccountForm token="tok" onLogout={vi.fn()} onLinked={onLinked} />)

    await user.type(screen.getByLabelText('Account name'), 'Acme EU')
    await user.type(screen.getByLabelText('Public key'), 'public-key-123')
    await user.type(screen.getByLabelText('Secret key'), 'secret-key-456')
    await user.click(screen.getByRole('button', { name: /link account/i }))

    expect(await screen.findByText('A Sendcloud account with this name already exists.')).toBeInTheDocument()
    expect(screen.getByLabelText('Account name')).toHaveValue('Acme EU')
    expect(onLinked).not.toHaveBeenCalled()
  })

  it('logs out on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onLogout = vi.fn()
    const user = userEvent.setup()

    render(<SendcloudAccountForm token="expired" onLogout={onLogout} onLinked={vi.fn()} />)

    await user.type(screen.getByLabelText('Account name'), 'Acme EU')
    await user.type(screen.getByLabelText('Public key'), 'public-key-123')
    await user.type(screen.getByLabelText('Secret key'), 'secret-key-456')
    await user.click(screen.getByRole('button', { name: /link account/i }))

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
