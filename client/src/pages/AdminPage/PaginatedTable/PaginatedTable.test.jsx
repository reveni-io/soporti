import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PaginatedTable from './PaginatedTable.jsx'

const ROWS = [
  { key: 'a', cells: ['First', 'v2'] },
  { key: 'b', cells: ['Second', 'v1'] },
]

describe('PaginatedTable', () => {
  it('shows the empty message when there are no rows', () => {
    render(
      <PaginatedTable
        headers={['Change', 'Version']}
        rows={[]}
        page={1}
        pageSize={5}
        total={0}
        onPage={vi.fn()}
        empty="No changes yet."
      />
    )

    expect(screen.getByText('No changes yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows a single page without the pager', () => {
    render(
      <PaginatedTable
        headers={['Change', 'Version']}
        rows={ROWS}
        page={1}
        pageSize={5}
        total={2}
        onPage={vi.fn()}
        empty=""
      />
    )

    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByRole('cell', { name: 'Second' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('moves between pages', async () => {
    const onPage = vi.fn()
    const user = userEvent.setup()

    render(
      <PaginatedTable
        headers={['Change', 'Version']}
        rows={ROWS}
        page={2}
        pageSize={5}
        total={12}
        onPage={onPage}
        empty=""
      />
    )

    expect(screen.getByText('Rows 6–7 of 12')).toBeInTheDocument()
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(onPage.mock.calls).toEqual([[1], [3]])
  })

  it('disables the buttons at the edges', () => {
    render(
      <PaginatedTable
        headers={['Change', 'Version']}
        rows={ROWS}
        page={1}
        pageSize={2}
        total={4}
        onPage={vi.fn()}
        empty=""
      />
    )

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })
})
