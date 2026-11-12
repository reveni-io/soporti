import { useState } from 'react'
import Icon from '../../../common/Icon/Icon.jsx'
import { ANALYTICS_STATUS } from '../../../constants.js'
import { useCardData } from '../hooks/useCardData/useCardData.js'
import ChartView from '../ChartView/ChartView.jsx'
import DeleteConfirm from '../DeleteConfirm/DeleteConfirm.jsx'
import CardSkeleton from './CardSkeleton/CardSkeleton.jsx'
import CardNotice from './CardNotice/CardNotice.jsx'
import { describeDataAge, formatExactTime } from './data-age.js'
import './ChartCard.css'

const GENERATION_FAILED = 'The chart could not be generated.'
const QUERY_FAILED = 'The query failed'
const DELETE_QUESTION = 'Delete this chart?'
const REFRESH_LABEL = 'Refresh data'
const REFRESH_HINT = 'Refresh data (runs the query again)'

export default function ChartCard({ card, token, onLogout, refreshKey, dragHandleProps, onEdit, onRetry, onDelete }) {
  const { data, loading, error, refresh } = useCardData(token, card, { refreshKey, onLogout })
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

  const isReady = card.status === ANALYTICS_STATUS.READY
  const isGenerating = card.status === ANALYTICS_STATUS.GENERATING

  function handleEdit() {
    onEdit(card)
  }

  function handleRetry() {
    onRetry(card)
  }

  function handleConfirmDelete() {
    setIsConfirmingDelete(false)
    onDelete(card)
  }

  return (
    <article className="card chart-card" aria-label={card.title}>
      <header className="chart-card__header" {...dragHandleProps}>
        <Icon name="grip" size={14} className="chart-card__grip" />
        <h2 className="chart-card__title" title={card.title}>
          {card.title}
        </h2>
        {isReady && data?.truncated && <span className="badge chart-card__badge">First 2,000 rows</span>}

        {isConfirmingDelete && (
          <DeleteConfirm
            question={DELETE_QUESTION}
            onConfirm={handleConfirmDelete}
            onCancel={() => setIsConfirmingDelete(false)}
          />
        )}
        {!isConfirmingDelete && (
          <>
            {isReady && data?.fetchedAt && <DataAge fetchedAt={data.fetchedAt} />}
            <div className="chart-card__actions">
              {isReady && <CardAction label={REFRESH_LABEL} hint={REFRESH_HINT} icon="refresh" onClick={refresh} />}
              {!isGenerating && <CardAction label="Edit chart and SQL" icon="code" onClick={handleEdit} />}
              <CardAction label="Delete chart" icon="trash" onClick={() => setIsConfirmingDelete(true)} />
            </div>
          </>
        )}
      </header>

      <div className="chart-card__body">
        <CardBody
          card={card}
          data={data}
          error={error}
          isRefreshing={loading}
          onEdit={handleEdit}
          onRetry={handleRetry}
        />
      </div>
    </article>
  )
}

function DataAge({ fetchedAt }) {
  return (
    <span className="chart-card__age">
      <time dateTime={fetchedAt} title={formatExactTime(fetchedAt)}>
        {describeDataAge(fetchedAt, Date.now())}
      </time>
    </span>
  )
}

function CardAction({ label, hint, icon, onClick }) {
  return (
    <button type="button" className="chart-card__action" aria-label={label} title={hint ?? label} onClick={onClick}>
      <Icon name={icon} size={15} />
    </button>
  )
}

function EditSqlButton({ onClick }) {
  return (
    <button type="button" className="btn btn--secondary btn--sm" onClick={onClick}>
      Edit SQL
    </button>
  )
}

function promptBesideTitle(card) {
  return card.prompt === card.title ? '' : card.prompt
}

function CardBody({ card, data, error, isRefreshing, onEdit, onRetry }) {
  if (card.status === ANALYTICS_STATUS.GENERATING) {
    return <CardSkeleton step={card.step} prompt={promptBesideTitle(card)} />
  }

  if (card.status === ANALYTICS_STATUS.FAILED) {
    return (
      <CardNotice message={card.error ?? GENERATION_FAILED}>
        <button type="button" className="btn btn--primary btn--sm" onClick={onRetry}>
          Try again
        </button>
        {card.sql && <EditSqlButton onClick={onEdit} />}
      </CardNotice>
    )
  }

  if (error) {
    return (
      <CardNotice heading={QUERY_FAILED} message={error} isCode>
        <EditSqlButton onClick={onEdit} />
      </CardNotice>
    )
  }

  if (!data) return <p className="chart-card__status">Loading data…</p>

  return (
    <div className={`chart-card__chart${isRefreshing ? ' chart-card__chart--refreshing' : ''}`}>
      <ChartView chart={card.chart} columns={data.columns} rows={data.rows} title={card.title} />
    </div>
  )
}
