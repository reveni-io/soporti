import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SendcloudAccountsTable from './SendcloudAccountsTable.jsx'

const ACCOUNTS = [
  { id: 1, name: 'Acme EU', createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 2, name: 'Acme US', createdAt: '2026-10-02T10:00:00.000Z' },
]

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('SendcloudAccountsTable', () => {
  it('says so when no account is linked', () => {
    render(<SendcloudAccountsTable token="tok" accounts={[]} onLogout={vi.fn()} onRemoved={vi.fn()} />)

    expect(screen.getByText('No Sendcloud account is linked yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('lists every linked account by name', () => {
    render(<SendcloudAccountsTable token="tok" accounts={ACCOUNTS} onLogout={vi.fn()} onRemoved={vi.fn()} />)

    expect(screen.getByText('Acme EU')).toBeInTheDocument()
    expect(screen.getByText('Acme US')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(2)
  })

  it('removes the chosen account and reloads the list', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ deleted: true }) })
    const onRemoved = vi.fn()
    const user = userEvent.setup()

    render(<SendcloudAccountsTable token="tok" accounts={ACCOUNTS} onLogout={vi.fn()} onRemoved={onRemoved} />)

    await user.click(screen.getByRole('button', { name: 'Remove Acme US' }))

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/admin/config/sendcloud/accounts/2')
    expect(options.method).toBe('DELETE')
    expect(onRemoved).toHaveBeenCalledTimes(1)
  })

  it('shows the error when the account cannot be removed', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Sendcloud account not found.' }),
    })
    const onRemoved = vi.fn()
    const user = userEvent.setup()

    render(<SendcloudAccountsTable token="tok" accounts={ACCOUNTS} onLogout={vi.fn()} onRemoved={onRemoved} />)

    await user.click(screen.getByRole('button', { name: 'Remove Acme EU' }))

    expect(await screen.findByText('Sendcloud account not found.')).toBeInTheDocument()
    expect(onRemoved).not.toHaveBeenCalled()
  })
})
