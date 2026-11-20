import { useState } from 'react'
import { useJevHistory } from '../hooks/useJevHistory/useJevHistory.js'
import PaginatedTable from '../PaginatedTable/PaginatedTable.jsx'
import { formatDateTime } from '../dates.js'

const HEADERS = ['Date', 'Author', 'Change', 'Version']

function toRow(entry, index) {
  return {
    key: `${entry.at}-${index}`,
    cells: [
      <span className="admin__nowrap">{formatDateTime(entry.at)}</span>,
      entry.author,
      entry.change,
      entry.rev === null ? <span className="admin__muted">immediate</span> : `v${entry.rev}`,
    ],
  }
}

export default function JevHistory({ token, documentId, onLogout }) {
  const [request, setRequest] = useState({ page: 1 })
  const { history, error } = useJevHistory(token, documentId, request, onLogout)

  if (error && !history) return <p className="alert alert--error">{error}</p>
  if (!history) return <p className="admin__muted">Loading...</p>

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}
      <PaginatedTable
        headers={HEADERS}
        rows={history.entries.map(toRow)}
        page={history.page}
        pageSize={history.pageSize}
        total={history.total}
        onPage={page => setRequest({ page })}
        empty="No changes yet."
      />
    </>
  )
}
