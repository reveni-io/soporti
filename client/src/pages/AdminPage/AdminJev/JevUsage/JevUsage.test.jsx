import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import JevUsage from './JevUsage.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('JevUsage', () => {
  it('shows the calls of each project and what Jev does in it', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        projects: [
          { id: 'github', calls: 1284 },
          { id: 'legal', calls: 41 },
        ],
      }),
    })

    render(<JevUsage token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByRole('cell', { name: 'GitHub reviews' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: (1284).toLocaleString() })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Warns Legal; Legal has the last word' })).toBeInTheDocument()
    expect(global.fetch.mock.calls[0][0]).toContain('/api/admin/config/jev/usage')
  })

  it('shows why the usage could not load', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Failed to load the Jev usage.' }),
    })

    render(<JevUsage token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Failed to load the Jev usage.')).toBeInTheDocument()
  })
})
