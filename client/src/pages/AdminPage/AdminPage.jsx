import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth/useAuth.js'
import { ROUTES } from '../../router/constants.js'
import { getAdminStatus } from '../../services/services.js'
import Login from '../../common/Login/Login.jsx'
import GridPattern from '../../common/GridPattern/GridPattern.jsx'
import AdminNavIcon from './AdminNavIcon/AdminNavIcon.jsx'
import AdminNotice from './AdminNotice/AdminNotice.jsx'
import BootstrapForm from './BootstrapForm/BootstrapForm.jsx'
import { SECTIONS } from './sections.js'
import './AdminPage.css'

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
      <GridPattern variant="light" />
      <header className="admin__header">
        <h1 className="admin__title">Administration</h1>
        <div className="admin__header-actions">
          <span className="admin__muted">{user.email}</span>
          <a className="admin__link" href={ROUTES.CHAT}>
            Go to chat
          </a>
          <button className="btn btn--secondary" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <div className="admin__body">
        <nav className="admin__nav card">
          <span className="admin__nav-title">Settings</span>
          {SECTIONS.map(section => (
            <NavLink
              key={section.path}
              to={`/admin/${section.path}`}
              className={({ isActive }) => `admin__nav-link${isActive ? ' admin__nav-link--active' : ''}`}
            >
              <span className="admin__nav-icon">
                <AdminNavIcon id={section.icon} />
              </span>
              {section.label}
            </NavLink>
          ))}
        </nav>

        <main className="admin__content">
          <Routes>
            {SECTIONS.map(section => (
              <Route
                key={section.path}
                path={section.path}
                element={<section.Component token={token} onLogout={logout} />}
              />
            ))}
            <Route path="*" element={<Navigate to={`/admin/${SECTIONS[0].path}`} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
