import PaginatedTable from '../../PaginatedTable/PaginatedTable.jsx'
import { formatDateTime } from '../../dates.js'
import { describeQueries, describeRuns } from '../describe-queries.js'

const HEADERS = ['Date', 'Query', 'Owner', 'Set', 'Reason']

function toRow(run, index) {
  return {
    key: `${run.at}-${index}`,
    cells: [
      <span className="admin__nowrap">{formatDateTime(run.at)}</span>,
      run.query,
      run.owner,
      run.setVersion === null ? '—' : `v${run.setVersion}`,
      run.reasons,
    ],
  }
}

export default function LegalUsage({ usage, error, onPage }) {
  if (error && !usage) return <p className="alert alert--error">{error}</p>
  if (!usage) return <p className="admin__muted">Loading...</p>

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}
      <dl className="admin__kv admin__kv--text">
        <div className="admin__kv-row">
          <dt>Check on</dt>
          <dd>{describeQueries(usage.queriesOn)}</dd>
        </div>
        <div className="admin__kv-row">
          <dt>Checked</dt>
          <dd>{describeRuns(usage.checkedRuns)}</dd>
        </div>
        <div className="admin__kv-row">
          <dt>Not checked</dt>
          <dd>{describeRuns(usage.uncheckedRuns)}</dd>
        </div>
      </dl>
      <h3 className="admin__subsection-title">Runs Jev could not check</h3>
      <PaginatedTable
        headers={HEADERS}
        rows={usage.unchecked.entries.map(toRow)}
        page={usage.unchecked.page}
        pageSize={usage.unchecked.pageSize}
        total={usage.unchecked.total}
        onPage={onPage}
        empty="Jev checked every run so far."
      />
    </>
  )
}
