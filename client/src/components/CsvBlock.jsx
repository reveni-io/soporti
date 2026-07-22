import { memo, useMemo } from 'react'

// Number of data rows rendered in the inline preview. The full dataset is
// always available through the download button.
const MAX_PREVIEW_ROWS = 50

// Minimal RFC 4180-ish CSV parser: handles quoted fields, embedded commas,
// escaped quotes ("") and both \n and \r\n line endings.
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

function downloadCsv(csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'soporti-export.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default memo(function CsvBlock({ csv, canDownload = true }) {
  const rows = useMemo(() => parseCsv(csv.trim()), [csv])

  if (rows.length === 0) {
    return null
  }

  const [header, ...body] = rows
  const previewBody = body.slice(0, MAX_PREVIEW_ROWS)
  const hiddenRows = body.length - previewBody.length

  return (
    <div className="csv-block">
      <div className="csv-block__toolbar">
        <span className="csv-block__meta">
          {body.length} {body.length === 1 ? 'row' : 'rows'} · {header.length}{' '}
          {header.length === 1 ? 'column' : 'columns'}
        </span>
        {canDownload && (
          <button type="button" className="csv-block__download" onClick={() => downloadCsv(csv)}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download CSV
          </button>
        )}
      </div>
      <div className="csv-block__scroll">
        <table className="csv-block__table">
          <thead>
            <tr>
              {header.map((cell, i) => (
                <th key={i}>{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewBody.map((r, ri) => (
              <tr key={ri}>
                {r.map((cell, ci) => (
                  <td key={ci}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hiddenRows > 0 && (
        <div className="csv-block__more">
          … and {hiddenRows} more {hiddenRows === 1 ? 'row' : 'rows'} — download to see all
        </div>
      )}
    </div>
  )
})
