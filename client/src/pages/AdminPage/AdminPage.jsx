import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth/useAuth.js'
import { ROUTES } from '../../router/constants.js'
import { getAdminStatus } from '../../services/services.js'
import Login from '../../common/Login/Login.jsx'
import GridPattern from '../../common/GridPattern/GridPattern.jsx'
import Icon from '../../common/Icon/Icon.jsx'
import ScreenTransition from '../../common/ScreenTransition/ScreenTransition.jsx'
import SharedElement from '../../common/SharedElement/SharedElement.jsx'
import ThemeToggle from '../../common/ThemeToggle/ThemeToggle.jsx'
import AdminNavIcon from './AdminNavIcon/AdminNavIcon.jsx'
import AdminNotice from './AdminNotice/AdminNotice.jsx'
import BootstrapForm from './BootstrapForm/BootstrapForm.jsx'
import { SECTIONS } from './sections.js'
import './AdminPage.css'

const NAV_INDICATOR_TRANSITION_NAME = 'admin-nav-indicator'
const HEADER_ICON_SIZE = 20
const ACTIVE_NAV_LINK_SELECTOR = '.admin__nav-link--active'

export default function AdminPage() {
  const {
    token,
    user,
    isAuthenticated,
    loginWithPassword,
    bootstrapAdmin,
    logout,
    error: authError,
    isLoggingIn,
  } = useAuth()
  const location = useLocation()
  const [adminExists, setAdminExists] = useState(null)
  const [statusError, setStatusError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await getAdminStatus()
        if (active) setAdminExists(data.adminExists)
      } catch (err) {
        if (active) setStatusError(err.message)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  async function handleBootstrap(email, password, name, setupCode) {
    const ok = await bootstrapAdmin(email, password, name, setupCode)
    if (ok) setAdminExists(true)
    return ok
  }

  if (statusError) {
    return (
      <AdminNotice title="Admin">
        <p className="alert alert--error">{statusError}</p>
      </AdminNotice>
    )
  }

  if (adminExists === null) {
    return (
      <AdminNotice title="Admin">
        <p className="admin__muted">Loading...</p>
      </AdminNotice>
    )
  }

  if (!adminExists) {
    return <BootstrapForm onBootstrap={handleBootstrap} error={authError} isLoading={isLoggingIn} />
  }

  if (!isAuthenticated) {
    return <Login onPasswordLogin={loginWithPassword} error={authError} isLoading={isLoggingIn} />
  }

  if (user?.role !== 'admin') {
    return (
      <AdminNotice title="Admin">
        <p className="alert alert--error">This page requires an admin account.</p>
        <button className="btn btn--secondary" onClick={logout}>
          Log out
        </button>
      </AdminNotice>
    )
  }

  return (
    <div className="admin">
      <GridPattern variant="surface" />
      <header className="admin__header">
        <h1 className="admin__title">Administration</h1>
        <div className="admin__header-actions">
          <span className="admin__muted admin__email">{user.email}</span>
          <a className="admin__link admin__back" href={ROUTES.CHAT} aria-label="Go to chat">
            <Icon name="arrow-left" size={HEADER_ICON_SIZE} className="admin__header-icon" />
            <span className="admin__header-label">Go to chat</span>
          </a>
          <ThemeToggle />
          <button className="btn btn--secondary admin__logout" onClick={logout} aria-label="Log out">
            <Icon name="log-out" size={HEADER_ICON_SIZE} className="admin__header-icon" />
            <span className="admin__header-label">Log out</span>
          </button>
        </div>
      </header>

      <div className="admin__body">
        <nav className="admin__nav card" ref={scrollActiveLinkIntoView}>
          <span className="admin__nav-title">Settings</span>
          {SECTIONS.map(section => (
            <NavLink
              key={section.path}
              to={`/admin/${section.path}`}
              className={({ isActive }) => `admin__nav-link${isActive ? ' admin__nav-link--active' : ''}`}
            >
              {({ isActive }) => <NavLinkContent section={section} isActive={isActive} />}
            </NavLink>
          ))}
        </nav>

        <main className="admin__content">
          <ScreenTransition key={location.pathname}>
            <Routes>
              {SECTIONS.map(section => (
                <Route
                  key={section.path}
                  path={section.path}
                  element={<section.Component token={token} onLogout={logout} />}
                />
              ))}
              <Route path="jev" element={<Navigate to={ROUTES.ADMIN_GUARDS} replace />} />
              <Route path="legal" element={<Navigate to={ROUTES.ADMIN_GUARDS} replace />} />
              <Route path="*" element={<Navigate to={`/admin/${SECTIONS[0].path}`} replace />} />
            </Routes>
          </ScreenTransition>
        </main>
      </div>
    </div>
  )
}

function scrollActiveLinkIntoView(nav) {
  const activeLink = nav?.querySelector(ACTIVE_NAV_LINK_SELECTOR)
  if (!activeLink) return

  nav.scrollLeft = activeLink.offsetLeft - (nav.clientWidth - activeLink.offsetWidth) / 2
}

function NavLinkContent({ section, isActive }) {
  return (
    <>
      {isActive && (
        <SharedElement name={NAV_INDICATOR_TRANSITION_NAME}>
          <span className="admin__nav-indicator" aria-hidden="true" />
        </SharedElement>
      )}
      <span className="admin__nav-icon">
        <AdminNavIcon id={section.icon} />
      </span>
      {section.label}
    </>
  )
}
