import { Link } from 'react-router-dom'
import { ROUTES } from '../../../../router/constants.js'

export default function SidebarFooter({
  isVideoGenerating,
  onOpenSchedules,
  onOpenArtifacts,
  onOpenSettings,
  onLogout,
}) {
  return (
    <div className="sidebar__footer">
      <button className="sidebar__schedules" onClick={onOpenSchedules}>
        Scheduled queries
      </button>
      <button className="sidebar__artifacts" onClick={onOpenArtifacts}>
        Artifacts
      </button>
      <Link className="sidebar__videos" to={ROUTES.VIDEOS}>
        Videos
        {isVideoGenerating && (
          <span className="sidebar__videos-dot" role="img" aria-label="A video is being generated" />
        )}
      </Link>
      <button className="sidebar__settings" onClick={onOpenSettings}>
        Settings
      </button>
      <button className="sidebar__logout" onClick={onLogout}>
        Log out
      </button>
    </div>
  )
}
