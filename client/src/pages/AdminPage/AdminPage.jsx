import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth/useAuth.js'
import { ROUTES } from '../../router/constants.js'
import Login from '../../common/Login/Login.jsx'
import GridPattern from '../../common/GridPattern/GridPattern.jsx'
import AdminUsers from './AdminUsers/AdminUsers.jsx'
import AdminAuthentication from './AdminAuthentication/AdminAuthentication.jsx'
import AdminGithub from './AdminGithub/AdminGithub.jsx'
import AdminGoogleDrive from './AdminGoogleDrive/AdminGoogleDrive.jsx'
import AdminNotion from './AdminNotion/AdminNotion.jsx'
import AdminHelpjuice from './AdminHelpjuice/AdminHelpjuice.jsx'
import AdminDatabase from './AdminDatabase/AdminDatabase.jsx'
import AdminShopify from './AdminShopify/AdminShopify.jsx'
import AdminShortcut from './AdminShortcut/AdminShortcut.jsx'
import AdminSentry from './AdminSentry/AdminSentry.jsx'
import AdminSlack from './AdminSlack/AdminSlack.jsx'
import AdminOpenAI from './AdminOpenAI/AdminOpenAI.jsx'
import IntegrationIcon from '../../common/IntegrationIcon/IntegrationIcon.jsx'
import './AdminPage.css'

function UsersIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function HelpCircleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function SparkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  )
}

function DatabaseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  )
}

const SECTIONS = [
  { path: 'users', label: 'Users', icon: <UsersIcon />, render: props => <AdminUsers {...props} /> },
  {
    path: 'authentication',
    label: 'Authentication',
    icon: <ShieldIcon />,
    render: props => <AdminAuthentication {...props} />,
  },
  {
    path: 'openai',
    label: 'OpenAI',
    icon: <SparkIcon />,
    render: props => <AdminOpenAI {...props} />,
  },
  {
    path: 'github',
    label: 'GitHub',
    icon: <IntegrationIcon id="github" size={16} />,
    render: props => <AdminGithub {...props} />,
  },
  {
    path: 'google-drive',
    label: 'Google Drive',
    icon: <IntegrationIcon id="google-drive" size={16} />,
    render: props => <AdminGoogleDrive {...props} />,
  },
  {
    path: 'notion',
    label: 'Notion',
    icon: <IntegrationIcon id="notion" size={16} />,
    render: props => <AdminNotion {...props} />,
  },
  {
    path: 'helpjuice',
    label: 'Helpjuice',
    icon: <HelpCircleIcon />,
    render: props => <AdminHelpjuice {...props} />,
  },
  {
    path: 'database',
    label: 'Database',
    icon: <DatabaseIcon />,
    render: props => <AdminDatabase {...props} />,
  },
  {
    path: 'shopify',
    label: 'Shopify',
    icon: <IntegrationIcon id="shopify" size={16} />,
    render: props => <AdminShopify {...props} />,
  },
  {
    path: 'shortcut',
    label: 'Shortcut',
    icon: <IntegrationIcon id="shortcut" size={16} />,
    render: props => <AdminShortcut {...props} />,
  },
  {
    path: 'sentry',
    label: 'Sentry',
    icon: <IntegrationIcon id="sentry" size={16} />,
    render: props => <AdminSentry {...props} />,
  },
  {
    path: 'slack',
    label: 'Slack',
    icon: <IntegrationIcon id="slack" size={16} />,
    render: props => <AdminSlack {...props} />,
  },
]

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
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/status`)
        if (!res.ok) throw new Error('Failed to check the admin status')
        const data = await res.json()
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

  if (statusError) {
    return (
      <div className="admin admin--centered">
        <GridPattern />
        <div className="card card--floating admin__card">
          <h1 className="admin__title">Admin</h1>
          <p className="alert alert--error">{statusError}</p>
        </div>
      </div>
    )
  }

  if (adminExists === null) {
    return (
      <div className="admin admin--centered">
        <GridPattern />
        <div className="card card--floating admin__card">
          <h1 className="admin__title">Admin</h1>
          <p className="admin__muted">Loading...</p>
        </div>
      </div>
    )
  }

  if (!adminExists) {
    const handleBootstrap = async (email, password, name, setupCode) => {
      const ok = await bootstrapAdmin(email, password, name, setupCode)
      if (ok) setAdminExists(true)
      return ok
    }
    return <BootstrapForm onBootstrap={handleBootstrap} error={authError} isLoading={isLoggingIn} />
  }

  if (!isAuthenticated) {
    return <Login onPasswordLogin={loginWithPassword} error={authError} isLoading={isLoggingIn} />
  }

  if (user?.role !== 'admin') {
    return (
      <div className="admin admin--centered">
        <GridPattern />
        <div className="card card--floating admin__card">
          <h1 className="admin__title">Admin</h1>
          <p className="alert alert--error">This page requires an admin account.</p>
          <button className="btn btn--secondary" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
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
              <span className="admin__nav-icon">{section.icon}</span>
              {section.label}
            </NavLink>
          ))}
        </nav>

        <main className="admin__content">
          <Routes>
            {SECTIONS.map(section => (
              <Route key={section.path} path={section.path} element={section.render({ token, onLogout: logout })} />
            ))}
            <Route path="*" element={<Navigate to={`/admin/${SECTIONS[0].path}`} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function BootstrapForm({ onBootstrap, error, isLoading }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [setupCode, setSetupCode] = useState('')
  const [localError, setLocalError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setLocalError(null)
    if (password !== confirm) {
      setLocalError('Passwords do not match.')
      return
    }
    await onBootstrap(email.trim(), password, name.trim() || undefined, setupCode.trim())
  }

  const displayError = localError || error

  return (
    <div className="admin admin--centered">
      <GridPattern />
      <div className="card card--floating admin__card">
        <h1 className="admin__title">Welcome to Soporti</h1>
        <p className="admin__muted">No admin account exists yet. Create the first one to finish the setup.</p>

        {displayError && <p className="alert alert--error">{displayError}</p>}

        <form className="admin__form" onSubmit={handleSubmit}>
          <input
            className="input"
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            disabled={isLoading}
            required
          />
          <input
            className="input"
            type="text"
            placeholder="Name (optional)"
            autoComplete="name"
            value={name}
            onChange={event => setName(event.target.value)}
            disabled={isLoading}
          />
          <input
            className="input"
            type="password"
            placeholder="Password (min. 8 characters)"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            value={password}
            onChange={event => setPassword(event.target.value)}
            disabled={isLoading}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Confirm password"
            autoComplete="new-password"
            value={confirm}
            onChange={event => setConfirm(event.target.value)}
            disabled={isLoading}
            required
          />
          <input
            className="input"
            type="text"
            placeholder="Setup code"
            autoComplete="off"
            value={setupCode}
            onChange={event => setSetupCode(event.target.value)}
            disabled={isLoading}
            required
          />
          <p className="admin__muted">The setup code was printed in the server logs at startup.</p>
          <button
            className="btn btn--primary"
            type="submit"
            disabled={isLoading || !email.trim() || !password || !confirm || !setupCode.trim()}
          >
            {isLoading ? 'Creating...' : 'Create admin account'}
          </button>
        </form>
      </div>
    </div>
  )
}
