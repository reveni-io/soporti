export default function PaginatedTable({ headers, rows, page, pageSize, total, onPage, empty }) {
  if (total === 0) return <p className="admin__muted">{empty}</p>

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const first = (page - 1) * pageSize + 1
  const last = first + rows.length - 1

  return (
    <>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th key={index}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key}>
                {row.cells.map((cell, index) => (
                  <td key={index}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="admin__form admin__form--row">
          <span className="admin__muted">
            Rows {first}–{last} of {total}
          </span>
          <button
            className="btn btn--secondary btn--sm"
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page === 1}
          >
            Previous
          </button>
          <span className="admin__muted">
            Page {page} of {pages}
          </span>
          <button
            className="btn btn--secondary btn--sm"
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page === pages}
          >
            Next
          </button>
        </div>
      )}
    </>
  )
}
