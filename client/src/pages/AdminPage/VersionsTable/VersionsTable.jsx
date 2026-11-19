import { useState } from 'react'
import { getJevVersions } from '../../../services/services.js'
import { useJevPage } from '../hooks/useJevPage/useJevPage.js'
import { JEV_PROJECT_LABELS } from '../jev-projects.js'
import PaginatedTable from '../PaginatedTable/PaginatedTable.jsx'
import { formatDateTime } from '../dates.js'

const HEADERS = ['Version', 'Date', 'Author', 'Change', '']
const HEADERS_WITH_CALLS = ['Version', 'Date', 'Author', 'Change', 'Calls', '']

export default function VersionsTable({ token, project, state, onLogout, withCalls = false }) {
  const [page, setPage] = useState(1)
  const { result, error } = useJevPage(getJevVersions, { token, documentId: project, page }, onLogout)
  const currentVersion = state.document.setVersion

  function handleRestore(entry) {
    state.restore(entry.version, draft => ({ ...draft, set: { ...draft.set, ...entry.set } }))
  }

  if (error) return <p className="alert alert--error">{error}</p>
  if (!result) return <p className="admin__muted">Loading...</p>

  function toCells(entry) {
    const cells = [
      <span className="admin__nowrap">
        v{entry.version} {entry.version === currentVersion && <span className="badge badge--success">current</span>}
      </span>,
      <span className="admin__nowrap">{formatDateTime(entry.at)}</span>,
      entry.author,
      entry.change,
    ]
    if (withCalls) cells.push((entry.calls ?? 0).toLocaleString())
    cells.push(
      entry.version !== currentVersion && (
        <button className="btn btn--secondary btn--sm" type="button" onClick={() => handleRestore(entry)}>
          Restore
        </button>
      )
    )

    return cells
  }

  const rows = result.entries.map(entry => ({ key: entry.version, cells: toCells(entry) }))

  return (
    <>
      <PaginatedTable
        headers={withCalls ? HEADERS_WITH_CALLS : HEADERS}
        rows={rows}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        onPage={setPage}
        empty="No versions yet. The first save creates version 1."
      />
      {state.restoredFrom && (
        <p className="note">
          Version {state.restoredFrom} is loaded in the editor. Save to publish it as version {currentVersion + 1}.
        </p>
      )}
      <p className="admin__muted">
        Restore loads the {JEV_PROJECT_LABELS[project].versioned} of that version into the editor. Saving publishes them
        as a new version, so no version is overwritten.
      </p>
    </>
  )
}
