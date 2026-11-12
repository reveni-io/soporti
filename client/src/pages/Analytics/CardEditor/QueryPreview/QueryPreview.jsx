import ChartView from '../../ChartView/ChartView.jsx'
import DataTable from '../../DataTable/DataTable.jsx'
import './QueryPreview.css'

const RUNNING_MESSAGE = 'Running the query…'
const EMPTY_MESSAGE = 'Write a query and run it to see the result.'
const TRUNCATED_NOTE = ' · first 2,000 shown'
const ROW_COUNT_FORMAT = new Intl.NumberFormat('en')

function describeRows(count) {
  return `${ROW_COUNT_FORMAT.format(count)} ${count === 1 ? 'row' : 'rows'}`
}

export default function QueryPreview({ chart, preview, isRunning }) {
  if (!preview) return <p className="query-preview__empty">{isRunning ? RUNNING_MESSAGE : EMPTY_MESSAGE}</p>

  const { columns, rows, truncated } = preview

  return (
    <div className={`query-preview${isRunning ? ' query-preview--running' : ''}`}>
      <div className="query-preview__chart">
        <ChartView chart={chart} columns={columns} rows={rows} />
      </div>

      <p className="query-preview__caption">
        <span className="query-preview__caption-title">Result</span>
        {describeRows(rows.length)}
        {truncated && TRUNCATED_NOTE}
      </p>
      <div className="query-preview__table">
        <DataTable columns={columns} rows={rows} />
      </div>
    </div>
  )
}
