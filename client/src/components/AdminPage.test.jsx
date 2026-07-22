import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminPage from './AdminPage.jsx'

vi.mock('../hooks/useAuth.js', () => ({
  useAuth: vi.fn(),
}))

vi.mock('./Login.jsx', () => ({
  default: ({ onLogin, onPasswordLogin }) => (
    <div data-testid="login-comp">
      {onLogin && <span data-testid="login-google" />}
      {onPasswordLogin && <span data-testid="login-password" />}
    </div>
  ),
}))

vi.mock('./GridPattern.jsx', () => ({
  default: () => null,
}))

vi.mock('./AdminUsers.jsx', () => ({
  default: () => <div data-testid="admin-users" />,
}))

vi.mock('./AdminAuthentication.jsx', () => ({
  default: () => <div data-testid="admin-authentication" />,
}))

vi.mock('./AdminGithub.jsx', () => ({
  default: () => <div data-testid="admin-github" />,
}))

vi.mock('./AdminGoogleDrive.jsx', () => ({
  default: () => <div data-testid="admin-google-drive" />,
}))

vi.mock('./AdminNotion.jsx', () => ({
  default: () => <div data-testid="admin-notion" />,
}))

vi.mock('./AdminHelpjuice.jsx', () => ({
  default: () => <div data-testid="admin-helpjuice" />,
}))

vi.mock('./AdminDatabase.jsx', () => ({
  default: () => <div data-testid="admin-database" />,
}))

vi.mock('./AdminShopify.jsx', () => ({
  default: () => <div data-testid="admin-shopify" />,
}))

vi.mock('./AdminShortcut.jsx', () => ({
  default: () => <div data-testid="admin-shortcut" />,
}))

vi.mock('./AdminSentry.jsx', () => ({
  default: () => <div data-testid="admin-sentry" />,
}))

vi.mock('./AdminSlack.jsx', () => ({
  default: () => <div data-testid="admin-slack" />,
}))

import { useAuth } from '../hooks/useAuth.js'

function mockAuth(overrides = {}) {
  useAuth.mockReturnValue({
    token: 'tok',
    user: null,
    isAuthenticated: false,
    loginWithGoogle: vi.fn(),
    loginWithPassword: vi.fn(),
    bootstrapAdmin: vi.fn(),
    logout: vi.fn(),
    error: null,
    isLoggingIn: false,
    ...overrides,
  })
}

function mockStatus(adminExists) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ adminExists }),
  })
}

// Mirrors production: AdminPage is mounted under /admin/* and routes its own
// sections internally.
function renderPage(initialPath = '/admin') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/*" element={<AdminPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AdminPage', () => {
  it('shows the bootstrap form when no admin exists', async () => {
    mockAuth()
    mockStatus(false)

    renderPage()

    expect(await screen.findByText(/No admin account exists yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create admin account/i })).toBeInTheDocument()
  })

  it('submits the bootstrap form (including the setup code) through bootstrapAdmin', async () => {
    const bootstrapAdmin = vi.fn().mockResolvedValue(true)
    mockAuth({ bootstrapAdmin })
    mockStatus(false)
    const user = userEvent.setup()

    renderPage()
    await screen.findByText(/No admin account exists yet/)

    await user.type(screen.getByPlaceholderText('Email'), 'boss@x.io')
    await user.type(screen.getByPlaceholderText(/^Password/), 'secret-password')
    await user.type(screen.getByPlaceholderText('Confirm password'), 'secret-password')
    await user.type(screen.getByPlaceholderText('Setup code'), 'code-from-logs')
    await user.click(screen.getByRole('button', { name: /create admin account/i }))

    expect(bootstrapAdmin).toHaveBeenCalledWith('boss@x.io', 'secret-password', undefined, 'code-from-logs')
  })

  it('leaves the bootstrap form after a successful bootstrap (renders the panel for the new admin)', async () => {
    const bootstrapAdmin = vi.fn().mockResolvedValue(true)
    // The real bootstrapAdmin logs the user in; simulate the post-login state.
    mockAuth({ bootstrapAdmin, isAuthenticated: true, user: { email: 'boss@x.io', role: 'admin' } })
    mockStatus(false)
    const user = userEvent.setup()

    renderPage()
    await screen.findByText(/No admin account exists yet/)

    await user.type(screen.getByPlaceholderText('Email'), 'boss@x.io')
    await user.type(screen.getByPlaceholderText(/^Password/), 'secret-password')
    await user.type(screen.getByPlaceholderText('Confirm password'), 'secret-password')
    await user.type(screen.getByPlaceholderText('Setup code'), 'code-from-logs')
    await user.click(screen.getByRole('button', { name: /create admin account/i }))

    expect(await screen.findByTestId('admin-users')).toBeInTheDocument()
    expect(screen.queryByText(/No admin account exists yet/)).not.toBeInTheDocument()
  })

  it('stays on the bootstrap form when the bootstrap fails', async () => {
    const bootstrapAdmin = vi.fn().mockResolvedValue(false)
    mockAuth({ bootstrapAdmin })
    mockStatus(false)
    const user = userEvent.setup()

    renderPage()
    await screen.findByText(/No admin account exists yet/)

    await user.type(screen.getByPlaceholderText('Email'), 'boss@x.io')
    await user.type(screen.getByPlaceholderText(/^Password/), 'secret-password')
    await user.type(screen.getByPlaceholderText('Confirm password'), 'secret-password')
    await user.type(screen.getByPlaceholderText('Setup code'), 'wrong-code')
    await user.click(screen.getByRole('button', { name: /create admin account/i }))

    expect(await screen.findByText(/No admin account exists yet/)).toBeInTheDocument()
  })

  it('keeps the submit disabled until the setup code is filled', async () => {
    mockAuth({ bootstrapAdmin: vi.fn() })
    mockStatus(false)
    const user = userEvent.setup()

    renderPage()
    await screen.findByText(/No admin account exists yet/)

    await user.type(screen.getByPlaceholderText('Email'), 'boss@x.io')
    await user.type(screen.getByPlaceholderText(/^Password/), 'secret-password')
    await user.type(screen.getByPlaceholderText('Confirm password'), 'secret-password')
    expect(screen.getByRole('button', { name: /create admin account/i })).toBeDisabled()

    await user.type(screen.getByPlaceholderText('Setup code'), 'code-from-logs')
    expect(screen.getByRole('button', { name: /create admin account/i })).toBeEnabled()
  })

  it('rejects mismatched passwords locally without calling the API', async () => {
    const bootstrapAdmin = vi.fn()
    mockAuth({ bootstrapAdmin })
    mockStatus(false)
    const user = userEvent.setup()

    renderPage()
    await screen.findByText(/No admin account exists yet/)

    await user.type(screen.getByPlaceholderText('Email'), 'boss@x.io')
    await user.type(screen.getByPlaceholderText(/^Password/), 'secret-password')
    await user.type(screen.getByPlaceholderText('Confirm password'), 'different-one')
    await user.type(screen.getByPlaceholderText('Setup code'), 'code-from-logs')
    await user.click(screen.getByRole('button', { name: /create admin account/i }))

    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
    expect(bootstrapAdmin).not.toHaveBeenCalled()
  })

  it('shows a password-only login when an admin exists and the visitor is unauthenticated', async () => {
    mockAuth({ isAuthenticated: false })
    mockStatus(true)

    renderPage()

    expect(await screen.findByTestId('login-comp')).toBeInTheDocument()
    expect(screen.getByTestId('login-password')).toBeInTheDocument()
    // No Google sign-in on the admin login: the admin always has a password
    // and Google may be disabled (empty domains) on a fresh install.
    expect(screen.queryByTestId('login-google')).not.toBeInTheDocument()
  })

  it('denies access to authenticated non-admins', async () => {
    mockAuth({ isAuthenticated: true, user: { email: 'sam@x.io', role: 'user' } })
    mockStatus(true)

    renderPage()

    expect(await screen.findByText('This page requires an admin account.')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-users')).not.toBeInTheDocument()
  })

  it('lands on the Users section by default, with the section nav visible', async () => {
    mockAuth({ isAuthenticated: true, user: { email: 'boss@x.io', role: 'admin' } })
    mockStatus(true)

    renderPage()

    expect(await screen.findByTestId('admin-users')).toBeInTheDocument()
    // One section at a time: Authentication is not rendered until selected.
    expect(screen.queryByTestId('admin-authentication')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Authentication' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Google Drive' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Helpjuice' })).toBeInTheDocument()
    expect(screen.getByText('boss@x.io')).toBeInTheDocument()
  })

  it('deep-links straight into the Google Drive section', async () => {
    mockAuth({ isAuthenticated: true, user: { email: 'boss@x.io', role: 'admin' } })
    mockStatus(true)

    renderPage('/admin/google-drive')

    expect(await screen.findByTestId('admin-google-drive')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-users')).not.toBeInTheDocument()
  })

  it('deep-links straight into the Database section', async () => {
    mockAuth({ isAuthenticated: true, user: { email: 'boss@x.io', role: 'admin' } })
    mockStatus(true)

    renderPage('/admin/database')

    expect(await screen.findByTestId('admin-database')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-users')).not.toBeInTheDocument()
  })

  it('switches sections through the nav', async () => {
    mockAuth({ isAuthenticated: true, user: { email: 'boss@x.io', role: 'admin' } })
    mockStatus(true)
    const user = userEvent.setup()

    renderPage()
    await screen.findByTestId('admin-users')

    await user.click(screen.getByRole('link', { name: 'Authentication' }))

    expect(await screen.findByTestId('admin-authentication')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-users')).not.toBeInTheDocument()
  })

  it('deep-links straight into a section', async () => {
    mockAuth({ isAuthenticated: true, user: { email: 'boss@x.io', role: 'admin' } })
    mockStatus(true)

    renderPage('/admin/authentication')

    expect(await screen.findByTestId('admin-authentication')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-users')).not.toBeInTheDocument()
  })

  it('redirects unknown sections to the first one', async () => {
    mockAuth({ isAuthenticated: true, user: { email: 'boss@x.io', role: 'admin' } })
    mockStatus(true)

    renderPage('/admin/nonexistent')

    expect(await screen.findByTestId('admin-users')).toBeInTheDocument()
  })

  it('surfaces a status check failure', async () => {
    mockAuth()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Failed to check the admin status')).toBeInTheDocument()
    })
  })
})
