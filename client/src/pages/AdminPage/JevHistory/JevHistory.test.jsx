import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import JevHistory from './JevHistory.jsx'

const AT = '2026-11-19T10:00:00.000Z'

function page(number, entries) {
  return { ok: true, status: 200, json: async () => ({ entries, total: 6, page: number, pageSize: 5 }) }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('JevHistory', () => {
  it('lists the changes, marking the ones applied immediately', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      page(1, [
        { at: AT, author: 'ana@example.com', change: 'Jev calls on', rev: 2 },
        { at: AT, author: 'luis@example.com', change: 'API key replaced', rev: null },
      ])
    )

    render(<JevHistory token="tok" documentId="jev" onLogout={vi.fn()} />)

    expect(await screen.findByRole('cell', { name: 'Jev calls on' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'v2' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'immediate' })).toBeInTheDocument()
    expect(global.fetch.mock.calls[0][0]).toContain('/api/admin/config/jev/documents/jev/history?page=1')
  })

  it('loads the next page', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(page(1, [{ at: AT, author: 'ana@example.com', change: 'Questions', rev: 6 }]))
      .mockResolvedValueOnce(page(2, [{ at: AT, author: 'ana@example.com', change: 'Created', rev: 1 }]))
    const user = userEvent.setup()

    render(<JevHistory token="tok" documentId="legal" onLogout={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Next' }))

    expect(await screen.findByRole('cell', { name: 'Created' })).toBeInTheDocument()
    expect(global.fetch.mock.calls[1][0]).toContain('/api/admin/config/jev/documents/legal/history?page=2')
  })

  it('shows why the history could not load', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Failed.' }) })

    render(<JevHistory token="tok" documentId="jev" onLogout={vi.fn()} />)

    expect(await screen.findByText('Failed.')).toBeInTheDocument()
  })

  it('logs out when the session expired', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onLogout = vi.fn()

    render(<JevHistory token="tok" documentId="jev" onLogout={onLogout} />)

    await vi.waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
  })
})
