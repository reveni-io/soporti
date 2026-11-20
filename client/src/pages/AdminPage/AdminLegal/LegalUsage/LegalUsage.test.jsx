import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LegalUsage from './LegalUsage.jsx'

const RUN = {
  at: '2026-11-18T07:00:00.000Z',
  query: 'Draft replies to data deletion requests',
  owner: 'marta@example.com',
  setVersion: 7,
  reasons: 'Jev error (HTTP 502)',
}

function usage(overrides = {}) {
  return {
    queriesOn: 4,
    checkedRuns: 1,
    uncheckedRuns: 6,
    unchecked: {
      entries: [RUN, { ...RUN, setVersion: null, reasons: 'Daily limit exceeded (50 calls)' }],
      total: 6,
      page: 1,
      pageSize: 5,
    },
    ...overrides,
  }
}

describe('LegalUsage', () => {
  it('counts the queries and the runs, and lists the runs Jev could not check', async () => {
    const onPage = vi.fn()
    const user = userEvent.setup()

    render(<LegalUsage usage={usage({ sentReplies: 1 })} error={null} onPage={onPage} />)

    expect(screen.getByText('4 scheduled queries')).toBeInTheDocument()
    expect(screen.getByText('1 reply')).toBeInTheDocument()
    expect(screen.getByText('1 run')).toBeInTheDocument()
    expect(screen.getByText('6 runs')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'v7' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '—' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Daily limit exceeded (50 calls)' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(onPage).toHaveBeenCalledWith(2)
  })

  it('says when Jev checked every run', () => {
    render(
      <LegalUsage
        usage={usage({ uncheckedRuns: 0, unchecked: { entries: [], total: 0, page: 1, pageSize: 5 } })}
        error={null}
        onPage={vi.fn()}
      />
    )

    expect(screen.getByText('Jev checked every run so far.')).toBeInTheDocument()
  })

  it('shows the loading state and the error', () => {
    const { rerender } = render(<LegalUsage usage={null} error={null} onPage={vi.fn()} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()

    rerender(<LegalUsage usage={null} error="Failed to load the Legal usage." onPage={vi.fn()} />)
    expect(screen.getByText('Failed to load the Legal usage.')).toBeInTheDocument()
  })

  it('keeps the last page it loaded under an error, so the page can be asked again', () => {
    render(<LegalUsage usage={usage()} error="Failed to load the Legal usage." onPage={vi.fn()} />)

    expect(screen.getByText('Failed to load the Legal usage.')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })
})
