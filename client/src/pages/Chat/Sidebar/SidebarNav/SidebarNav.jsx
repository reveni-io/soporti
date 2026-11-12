import { Link } from 'react-router-dom'
import Icon from '../../../../common/Icon/Icon.jsx'
import { ROUTES } from '../../../../router/constants.js'
import './SidebarNav.css'

const NAV_ICON_SIZE = 16

export default function SidebarNav({ isVideoGenerating, onOpenArtifacts, onOpenSchedules }) {
  return (
    <nav className="sidebar-nav" aria-label="Workspace">
      <button type="button" className="sidebar-nav__item" onClick={onOpenArtifacts}>
        <Icon name="artifact" size={NAV_ICON_SIZE} className="sidebar-nav__icon" />
        Artifacts
      </button>
      <Link className="sidebar-nav__item" to={ROUTES.ANALYTICS}>
        <Icon name="chart" size={NAV_ICON_SIZE} className="sidebar-nav__icon" />
        Analytics
      </Link>
      <Link className="sidebar-nav__item" to={ROUTES.VIDEOS}>
        <Icon name="video" size={NAV_ICON_SIZE} className="sidebar-nav__icon" />
        Videos
        {isVideoGenerating && <span className="sidebar-nav__live" role="img" aria-label="A video is being generated" />}
      </Link>
      <button type="button" className="sidebar-nav__item" onClick={onOpenSchedules}>
        <Icon name="clock" size={NAV_ICON_SIZE} className="sidebar-nav__icon" />
        Scheduled queries
      </button>
    </nav>
  )
}
