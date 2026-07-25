import { memo, useMemo } from 'react'
import Icon from '../Icon/Icon.jsx'
import { downloadCsv, parseCsv } from './csv.js'

const MAX_PREVIEW_ROWS = 50
const ICON_SIZE = 14

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
            <Icon name="download" size={ICON_SIZE} />
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
            {previewBody.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
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
