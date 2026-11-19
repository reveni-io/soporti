import { useState } from 'react'
import { useJevHistory } from '../hooks/useJevHistory/useJevHistory.js'
import PaginatedTable from '../PaginatedTable/PaginatedTable.jsx'
import { formatDateTime } from '../dates.js'

const HEADERS = ['Date', 'Author', 'Change', 'Version']

function toRow(entry, index) {
  return {
    key: `${entry.at}-${index}`,
    cells: [
      formatDateTime(entry.at),
      entry.author,
      entry.change,
      entry.rev === null ? <span className="admin__muted">immediate</span> : `v${entry.rev}`,
    ],
  }
}

export default function JevHistory({ token, documentId, onLogout }) {
  const [page, setPage] = useState(1)
  const { history, error } = useJevHistory(token, documentId, page, onLogout)

  if (error) return <p className="alert alert--error">{error}</p>
  if (!history) return <p className="admin__muted">Loading...</p>

  return (
    <PaginatedTable
      headers={HEADERS}
      rows={history.entries.map(toRow)}
      page={history.page}
      pageSize={history.pageSize}
      total={history.total}
      onPage={setPage}
      empty="No changes yet."
    />
  )
}
