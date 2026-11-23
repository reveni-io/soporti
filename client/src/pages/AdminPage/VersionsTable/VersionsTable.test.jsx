import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VersionsTable from './VersionsTable.jsx'

const AT = '2026-11-19T10:00:00.000Z'
const VERSIONS = [
  { version: 2, at: AT, author: 'ana@example.com', change: 'Min confidence 75 → 80', set: { minConfidence: 0.8 } },
  { version: 1, at: AT, author: 'luis@example.com', change: 'Created', set: { minConfidence: 0.75, questions: [] } },
]

function respond(entries, total = entries.length) {
  return { ok: true, status: 200, json: async () => ({ entries, total, page: 1, pageSize: 5 }) }
}

function tableState(restoredFrom = null) {
  return { document: { setVersion: 2 }, restoredFrom, restore: vi.fn() }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('VersionsTable', () => {
  it('marks the current version and restores an older one into the draft', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(VERSIONS))
    const state = tableState()
    const user = userEvent.setup()

    render(<VersionsTable token="tok" project="github" state={state} onLogout={vi.fn()} />)

    expect(await screen.findByText('current')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Restore' })).toHaveLength(1)
    expect(global.fetch.mock.calls[0][0]).toContain('/api/admin/config/jev/documents/github/versions?page=1')

    await user.click(screen.getByRole('button', { name: 'Restore' }))

    expect(state.restore).toHaveBeenCalledTimes(1)
    const [version, update] = state.restore.mock.calls[0]
    expect(version).toBe(1)
    expect(update({ set: { minConfidence: 0.8, questions: ['q'], description: 'Kept' }, repos: [] })).toEqual({
      set: { minConfidence: 0.75, questions: [], description: 'Kept' },
      repos: [],
    })
    expect(screen.getByText(/questions and min confidence/)).toBeInTheDocument()
  })

  it('says which version is loaded in the editor', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(VERSIONS))

    render(<VersionsTable token="tok" project="legal" state={tableState(1)} onLogout={vi.fn()} />)

    expect(
      await screen.findByText('Version 1 is loaded in the editor. Save to publish it as version 3.')
    ).toBeInTheDocument()
    expect(screen.getByText(/the questions and min confidence/)).toBeInTheDocument()
  })

  it('explains that the first save creates the first version', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond([]))

    render(<VersionsTable token="tok" project="legal" state={tableState()} onLogout={vi.fn()} />)

    expect(await screen.findByText('No versions yet. The first save creates version 1.')).toBeInTheDocument()
  })

  it('shows why the versions could not load', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Failed.' }) })

    render(<VersionsTable token="tok" project="legal" state={tableState()} onLogout={vi.fn()} />)

    expect(await screen.findByText('Failed.')).toBeInTheDocument()
  })
})
