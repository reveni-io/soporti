import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth/useAuth.js'
import ScreenTransition from '../../common/ScreenTransition/ScreenTransition.jsx'
import { useAnalyticsDashboards } from './hooks/useAnalyticsDashboards/useAnalyticsDashboards.js'
import { dashboardPath } from './dashboard-path.js'
import DashboardHeader from './DashboardHeader/DashboardHeader.jsx'
import DashboardView from './DashboardView/DashboardView.jsx'
import './Analytics.css'

function isOwned(dashboard) {
  return dashboard.isOwner
}

export default function Analytics({ dashboardId }) {
  const { token, logout } = useAuth()
  const directory = useAnalyticsDashboards(token, logout)
  const ownDashboard = directory.dashboards.find(isOwned)

  if (dashboardId) {
    return (
      <div className="analytics">
        <ScreenTransition key={dashboardId}>
          <DashboardView dashboardId={dashboardId} token={token} onLogout={logout} directory={directory} />
        </ScreenTransition>
      </div>
    )
  }

  if (ownDashboard) return <Navigate replace to={dashboardPath(ownDashboard.id)} />

  return (
    <div className="analytics">
      <DashboardHeader />
      <main className="analytics__body">
        <LandingStatus error={directory.error} />
      </main>
    </div>
  )
}

function LandingStatus({ error }) {
  if (!error) return <p className="analytics__status">Loading…</p>

  return (
    <p className="alert alert--error" role="alert">
      {error}
    </p>
  )
}
