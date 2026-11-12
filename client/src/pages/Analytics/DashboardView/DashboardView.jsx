import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../../common/Icon/Icon.jsx'
import { ANALYTICS_STATUS } from '../../../constants.js'
import { ROUTES } from '../../../router/constants.js'
import { useAnalyticsCards } from '../hooks/useAnalyticsCards/useAnalyticsCards.js'
import { syncLayout } from '../DashboardGrid/grid-layout.js'
import DashboardGrid from '../DashboardGrid/DashboardGrid.jsx'
import DashboardHeader from '../DashboardHeader/DashboardHeader.jsx'
import AskBar from '../AskBar/AskBar.jsx'
import ChartCard from '../ChartCard/ChartCard.jsx'
import CardEditor from '../CardEditor/CardEditor.jsx'
import EmptyDashboard from '../EmptyDashboard/EmptyDashboard.jsx'

const NO_POSITIONS = []

function toLayoutItem(card) {
  return { id: card.id, ...card.layout }
}

function isReady(card) {
  return card.status === ANALYTICS_STATUS.READY
}

export default function DashboardView({ dashboardId, token, onLogout, directory }) {
  const {
    dashboard: loadedDashboard,
    cards,
    notFound,
    loading,
    error,
    create,
    revise,
    retry,
    update,
    remove,
    saveLayout,
  } = useAnalyticsCards(token, dashboardId, onLogout)
  const [positions, setPositions] = useState(NO_POSITIONS)
  const [refreshKey, setRefreshKey] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const askBarRef = useRef(null)

  if (notFound) {
    return (
      <>
        <DashboardHeader />
        <main className="analytics__body">
          <UnavailableNotice />
        </main>
      </>
    )
  }

  const listedDashboard = directory.dashboards.find(candidate => candidate.id === dashboardId)
  const layout = syncLayout(positions, cards.map(toLayoutItem))
  const editingCard = cards.find(card => card.id === editingId)
  const notice = actionError ?? error ?? directory.error

  function handleLayoutChange(nextLayout) {
    setPositions(nextLayout)
    saveLayout(nextLayout)
  }

  function handleRefresh() {
    setRefreshKey(key => key + 1)
  }

  async function runCardAction(action) {
    setActionError(null)

    try {
      await action()
    } catch (err) {
      setActionError(err.message)
    }
  }

  function handleRetry(card) {
    runCardAction(() => retry(card.id))
  }

  function handleDelete(card) {
    runCardAction(() => remove(card.id))
  }

  function renderCard(id, { handleProps }) {
    const card = cards.find(candidate => candidate.id === id)
    if (!card) return null

    return (
      <ChartCard
        card={card}
        token={token}
        onLogout={onLogout}
        refreshKey={refreshKey}
        dragHandleProps={handleProps}
        onEdit={() => setEditingId(id)}
        onRetry={handleRetry}
        onDelete={handleDelete}
      />
    )
  }

  return (
    <>
      <DashboardHeader
        dashboard={listedDashboard ?? loadedDashboard}
        dashboards={directory.dashboards}
        cardCount={cards.length}
        canRefresh={cards.some(isReady)}
        onRefresh={handleRefresh}
        onCreate={directory.create}
        onUpdate={directory.update}
        onRemove={directory.remove}
      />

      <main className="analytics__body">
        <AskBar ref={askBarRef} onAsk={create} disabled={directory.configured === false} />

        {notice && (
          <p className="alert alert--error" role="alert">
            {notice}
          </p>
        )}

        <DashboardBody
          loading={loading || directory.loading}
          hasLoaded={Boolean(loadedDashboard) && directory.configured !== null}
          configured={directory.configured}
          isEmpty={cards.length === 0}
          onPickExample={prompt => askBarRef.current.fill(prompt)}
        >
          <DashboardGrid layout={layout} onLayoutChange={handleLayoutChange} renderItem={renderCard} />
        </DashboardBody>
      </main>

      {editingCard && (
        <CardEditor
          card={editingCard}
          token={token}
          onLogout={onLogout}
          onClose={() => setEditingId(null)}
          onSave={update}
          onRevise={revise}
          onDelete={remove}
        />
      )}
    </>
  )
}

function DashboardBody({ loading, hasLoaded, configured, isEmpty, onPickExample, children }) {
  if (loading) return <p className="analytics__status">Loading…</p>
  if (!hasLoaded) return null
  if (!configured) return <DatabaseNotice />
  if (isEmpty) return <EmptyDashboard onPickExample={onPickExample} />

  return children
}

function PageNotice({ icon, title, text, actionLabel, actionTo }) {
  return (
    <section className="analytics__notice">
      <span className="analytics__notice-icon">
        <Icon name={icon} size={22} strokeWidth={1.5} />
      </span>
      <h2 className="analytics__notice-title">{title}</h2>
      <p className="analytics__notice-text">{text}</p>
      <Link className="btn btn--secondary analytics__notice-action" to={actionTo}>
        {actionLabel}
      </Link>
    </section>
  )
}

function DatabaseNotice() {
  return (
    <PageNotice
      icon="database"
      title="Connect a database first"
      text="Analytics draws its charts from the PostgreSQL database configured in the admin panel (Database section)."
      actionLabel="Open admin"
      actionTo={ROUTES.ADMIN}
    />
  )
}

function UnavailableNotice() {
  return (
    <PageNotice
      icon="help-circle"
      title="This dashboard is not available"
      text="It does not exist or is no longer shared with you."
      actionLabel="Go to my dashboards"
      actionTo={ROUTES.ANALYTICS}
    />
  )
}
