import { useMemo } from 'react'
import { createLabelFormatter, formatNumber } from '../ChartView/chart-data.js'
import './DataTable.css'

const MAX_ROWS = 200
const MAX_CELL_LENGTH = 80
const NULL_TEXT = '—'
const ELLIPSIS = '…'
const EMPTY_MESSAGE = 'No rows returned'

function formatCell(value, formatDate) {
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'object') return JSON.stringify(value)
  if (formatDate) return formatDate(value)

  return String(value)
}

function cellClassName(value, kind) {
  const base = `data-table__cell data-table__cell--${kind}`

  if (value === null || value === undefined) return `${base} data-table__cell--null`
  if (typeof value === 'object') return `${base} data-table__cell--json`

  return base
}

export default function DataTable({ columns, rows }) {
  const dateFormatters = useMemo(() => {
    return columns.map(column => (column.kind === 'date' ? createLabelFormatter(column, rows).long : null))
  }, [columns, rows])
  const visibleRows = rows.slice(0, MAX_ROWS)

  return (
    <div className="data-table">
      <div className="data-table__scroll">
        <table className="data-table__table">
          <thead>
            <tr>
              {columns.map(column => (
                <th key={column.name} scope="col" className={`data-table__head data-table__head--${column.kind}`}>
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column, columnIndex) => (
                  <DataCell
                    key={column.name}
                    value={row[column.name]}
                    kind={column.kind}
                    formatDate={dateFormatters[columnIndex]}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TableFooter total={rows.length} />
    </div>
  )
}

function DataCell({ value, kind, formatDate }) {
  const className = cellClassName(value, kind)

  if (value === null || value === undefined) return <td className={className}>{NULL_TEXT}</td>

  const text = formatCell(value, formatDate)

  if (text.length <= MAX_CELL_LENGTH) return <td className={className}>{text}</td>

  return (
    <td className={className} title={text}>
      {text.slice(0, MAX_CELL_LENGTH).trimEnd()}
      {ELLIPSIS}
    </td>
  )
}

function TableFooter({ total }) {
  if (total === 0) return <p className="data-table__footer">{EMPTY_MESSAGE}</p>
  if (total <= MAX_ROWS) return null

  return (
    <p className="data-table__footer">
      Showing the first {formatNumber(MAX_ROWS)} of {formatNumber(total)} rows
    </p>
  )
}
