import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DocBar from './DocBar.jsx'

function state(overrides = {}) {
  return {
    document: { rev: 4, savedAt: '2026-11-19T10:00:00.000Z', savedBy: 'ana@example.com' },
    dirty: false,
    saving: false,
    saveError: null,
    conflict: false,
    savedAt: null,
    save: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  }
}

describe('DocBar', () => {
  it('shows the version, who saved it and keeps Save off without changes', () => {
    render(<DocBar label="Legal project" state={state()} />)

    expect(screen.getByText(/version 4 · saved .* by ana@example\.com/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save (v4 → v5)' })).toBeDisabled()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('saves the pending changes', async () => {
    const current = state({ dirty: true })
    const user = userEvent.setup()

    render(<DocBar label="Legal project" state={current} />)
    await user.click(screen.getByRole('button', { name: 'Save (v4 → v5)' }))

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(current.save).toHaveBeenCalledTimes(1)
  })

  it('confirms the save', () => {
    render(<DocBar label="Legal project" state={state({ savedAt: 1 })} />)

    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('offers to reload after a conflict', async () => {
    const current = state({ dirty: true, conflict: true, saveError: 'luis@example.com saved version 5.' })
    const user = userEvent.setup()

    render(<DocBar label="Legal project" state={current} />)
    await user.click(screen.getByRole('button', { name: 'Reload latest' }))

    expect(screen.getByText('luis@example.com saved version 5.')).toBeInTheDocument()
    expect(current.reload).toHaveBeenCalledTimes(1)
  })

  it('shows a document that was never saved', () => {
    render(<DocBar label="Jev settings" state={state({ document: { rev: 0, savedAt: null }, saving: true })} />)

    expect(screen.getByText(/version 0$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
  })
})
