import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../../common/Icon/Icon.jsx'
import { ROUTES } from '../../../router/constants.js'
import { dashboardPath } from '../dashboard-path.js'
import DashboardSwitcher from '../DashboardSwitcher/DashboardSwitcher.jsx'
import NewDashboardModal from '../NewDashboardModal/NewDashboardModal.jsx'
import ShareDashboardModal from '../ShareDashboardModal/ShareDashboardModal.jsx'
import DashboardSettingsModal from '../DashboardSettingsModal/DashboardSettingsModal.jsx'
import './DashboardHeader.css'

const MODAL = { NEW: 'new', SHARE: 'share', SETTINGS: 'settings' }
const PAGE_TITLE = 'Analytics'

function describeCount(count) {
  return `${count} ${count === 1 ? 'chart' : 'charts'}`
}

export default function DashboardHeader({
  dashboard,
  dashboards,
  cardCount,
  canRefresh,
  onRefresh,
  onCreate,
  onUpdate,
  onRemove,
}) {
  const navigate = useNavigate()
  const [openModal, setOpenModal] = useState(null)

  if (!dashboard) {
    return (
      <header className="dashboard-header">
        <BackLink />
        <h1>{PAGE_TITLE}</h1>
      </header>
    )
  }

  function closeModal() {
    setOpenModal(null)
  }

  async function handleCreate(name) {
    const created = await onCreate(name)
    if (created) navigate(dashboardPath(created.id))
  }

  function handleRename(name) {
    return onUpdate(dashboard.id, { name })
  }

  async function handleDelete() {
    await onRemove(dashboard.id)
    navigate(ROUTES.ANALYTICS)
  }

  return (
    <>
      <header className="dashboard-header">
        <BackLink />

        <div className="dashboard-header__heading">
          <DashboardSwitcher current={dashboard} dashboards={dashboards} onCreate={() => setOpenModal(MODAL.NEW)} />
          <SharingBadge dashboard={dashboard} />
          {cardCount > 0 && <span className="dashboard-header__count">{describeCount(cardCount)}</span>}
        </div>

        <div className="dashboard-header__actions">
          <HeaderAction label="Share" text="Share" icon="share" onClick={() => setOpenModal(MODAL.SHARE)} />
          {dashboard.isOwner && (
            <HeaderAction label="Rename or delete dashboard" icon="edit" onClick={() => setOpenModal(MODAL.SETTINGS)} />
          )}
          {canRefresh && <HeaderAction label="Refresh" text="Refresh" icon="refresh" onClick={onRefresh} />}
        </div>
      </header>

      {openModal === MODAL.NEW && <NewDashboardModal onCreate={handleCreate} onClose={closeModal} />}
      {openModal === MODAL.SHARE && (
        <ShareDashboardModal dashboard={dashboard} onUpdate={onUpdate} onClose={closeModal} />
      )}
      {openModal === MODAL.SETTINGS && (
        <DashboardSettingsModal
          dashboard={dashboard}
          onRename={handleRename}
          onDelete={handleDelete}
          onClose={closeModal}
        />
      )}
    </>
  )
}

function BackLink() {
  return (
    <Link className="dashboard-header__back" to={ROUTES.CHAT}>
      &larr; Chat
    </Link>
  )
}

function SharingBadge({ dashboard }) {
  if (!dashboard.shared) return null
  if (dashboard.isOwner) return <OwnBadge />

  return (
    <span className="badge dashboard-header__badge" title={`Shared by ${dashboard.ownerName}`}>
      Shared by {dashboard.ownerName}
    </span>
  )
}

function OwnBadge() {
  return <span className="badge badge--success dashboard-header__badge">Shared with the team</span>
}

function HeaderAction({ label, text, icon, onClick }) {
  return (
    <button type="button" className="btn btn--secondary btn--sm" aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} size={14} />
      {text && <span className="dashboard-header__action-text">{text}</span>}
    </button>
  )
}
