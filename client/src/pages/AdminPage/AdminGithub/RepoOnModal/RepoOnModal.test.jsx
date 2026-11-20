import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RepoOnModal from './RepoOnModal.jsx'

const NAMES = ['acme/web', 'acme/docs']

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('RepoOnModal', () => {
  it('shows the shadow results of every repo and warns about the ones without data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        repos: [
          { repo: 'acme/web', evaluated: 184, wouldApprove: 61, days: 21 },
          { repo: 'acme/docs', evaluated: 0, wouldApprove: 0, days: 0 },
        ],
      }),
    })
    const onConfirm = vi.fn()
    const user = userEvent.setup()

    render(<RepoOnModal token="tok" names={NAMES} onConfirm={onConfirm} onCancel={vi.fn()} onLogout={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Set 2 repos to on?' })).toBeInTheDocument()
    expect(await screen.findByText('61 (33%)')).toBeInTheDocument()
    expect(
      screen.getByText(/No PR evaluated in shadow mode yet for acme\/docs\. .*turning it on\./)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Set to on' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows why the results could not load and lets the change be cancelled', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Failed.' }) })
    const onCancel = vi.fn()
    const user = userEvent.setup()

    render(<RepoOnModal token="tok" names={['acme/web']} onConfirm={vi.fn()} onCancel={onCancel} onLogout={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Set acme/web to on?' })).toBeInTheDocument()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(await screen.findByText('Failed.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
