import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import DataTable from './DataTable.jsx'

const COLUMNS = [
  { name: 'id', kind: 'number' },
  { name: 'customer', kind: 'text' },
  { name: 'created_at', kind: 'date' },
  { name: 'paid', kind: 'boolean' },
  { name: 'meta', kind: 'text' },
]

const LONG_NOTE =
  'Customer asked to split the shipment in two parcels because the first address cannot receive pallets after 5pm'

function cellsOfRow(index) {
  return within(screen.getAllByRole('row')[index]).getAllByRole('cell')
}

describe('DataTable', () => {
  it('renders a real table with one column header per column', () => {
    render(
      <DataTable columns={COLUMNS} rows={[{ id: 1, customer: 'Ada', created_at: null, paid: true, meta: null }]} />
    )

    const headers = screen.getAllByRole('columnheader')

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(headers.map(header => header.textContent)).toEqual(['id', 'customer', 'created_at', 'paid', 'meta'])
    headers.forEach(header => {
      expect(header).toHaveAttribute('scope', 'col')
    })
  })

  it('formats numbers with separators and aligns the column to the right', () => {
    const columns = [{ name: 'total', kind: 'number' }]

    render(<DataTable columns={columns} rows={[{ total: 12345.6 }]} />)

    expect(screen.getByRole('cell', { name: '12,345.6' })).toHaveClass('data-table__cell--number')
    expect(screen.getByRole('columnheader', { name: 'total' })).toHaveClass('data-table__head--number')
  })

  it('formats dates by the granularity of their column', () => {
    const columns = [
      { name: 'day', kind: 'date' },
      { name: 'at', kind: 'date' },
    ]
    const rows = [
      { day: '2026-03-03T00:00:00.000Z', at: '2026-03-03T14:00:00.000Z' },
      { day: '2026-03-04T00:00:00.000Z', at: '2026-03-04T09:30:00.000Z' },
    ]

    render(<DataTable columns={columns} rows={rows} />)

    expect(cellsOfRow(1).map(cell => cell.textContent)).toEqual(['Mar 3, 2026', 'Mar 3, 2026, 14:00'])
    expect(cellsOfRow(2).map(cell => cell.textContent)).toEqual(['Mar 4, 2026', 'Mar 4, 2026, 09:30'])
  })

  it('shows null as a muted em dash that keeps the alignment of its column', () => {
    render(<DataTable columns={COLUMNS} rows={[{ id: null, customer: null, created_at: null, paid: null }]} />)

    const cells = cellsOfRow(1)

    expect(cells.map(cell => cell.textContent)).toEqual(['—', '—', '—', '—', '—'])
    expect(cells[0]).toHaveClass('data-table__cell--null', 'data-table__cell--number')
  })

  it('writes booleans as true and false', () => {
    const columns = [{ name: 'paid', kind: 'boolean' }]

    render(<DataTable columns={columns} rows={[{ paid: true }, { paid: false }]} />)

    expect(screen.getByRole('cell', { name: 'true' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'false' })).toBeInTheDocument()
  })

  it('writes objects and arrays as compact JSON', () => {
    const columns = [{ name: 'meta', kind: 'text' }]

    render(<DataTable columns={columns} rows={[{ meta: { channel: 'web', tags: ['vip', 'eu'] } }]} />)

    expect(screen.getByRole('cell', { name: '{"channel":"web","tags":["vip","eu"]}' })).toHaveClass(
      'data-table__cell--json'
    )
  })

  it('truncates long text and keeps the full value in the title', () => {
    const columns = [{ name: 'note', kind: 'text' }]

    render(<DataTable columns={columns} rows={[{ note: LONG_NOTE }, { note: 'ok' }]} />)

    const [long] = cellsOfRow(1)
    const [short] = cellsOfRow(2)

    expect(long).toHaveTextContent('Customer asked to split the shipment in two parcels because the first address ca…')
    expect(long).toHaveAttribute('title', LONG_NOTE)
    expect(short).not.toHaveAttribute('title')
  })

  it('renders text as text, never as markup', () => {
    const columns = [{ name: 'note', kind: 'text' }]

    render(<DataTable columns={columns} rows={[{ note: '<img src=x onerror=alert(1)>' }]} />)

    expect(screen.getByRole('cell', { name: '<img src=x onerror=alert(1)>' })).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows every row and no footer up to two hundred rows', () => {
    const columns = [{ name: 'id', kind: 'number' }]
    const rows = Array.from({ length: 200 }, (_, index) => ({ id: index }))

    render(<DataTable columns={columns} rows={rows} />)

    expect(screen.getAllByRole('row')).toHaveLength(201)
    expect(screen.queryByText(/showing the first/i)).not.toBeInTheDocument()
  })

  it('renders the first two hundred rows and says how many there are', () => {
    const columns = [{ name: 'id', kind: 'number' }]
    const rows = Array.from({ length: 1340 }, (_, index) => ({ id: index }))

    render(<DataTable columns={columns} rows={rows} />)

    expect(screen.getAllByRole('row')).toHaveLength(201)
    expect(screen.getByText('Showing the first 200 of 1,340 rows')).toBeInTheDocument()
  })

  it('keeps the headers and says so when the query returned no rows', () => {
    render(<DataTable columns={COLUMNS} rows={[]} />)

    expect(screen.getAllByRole('columnheader')).toHaveLength(5)
    expect(screen.getByText('No rows returned')).toBeInTheDocument()
  })
})
