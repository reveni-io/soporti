import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage.jsx'

vi.mock('../../hooks/useAuth/useAuth.js', () => ({
  useAuth: vi.fn(),
}))

const useAuthMethods = vi.fn(() => ({ google: true, password: true }))
vi.mock('../../hooks/useAuthMethods/useAuthMethods.js', () => ({
  useAuthMethods: () => useAuthMethods(),
}))

const navigate = vi.fn()
vi.mock('react-router-dom', async importOriginal => {
  const original = await importOriginal()
  return { ...original, useNavigate: () => navigate }
})

vi.mock('../../common/Login/Login.jsx', () => ({
  default: ({ onLogin, onPasswordLogin, error, isLoading }) => (
    <div data-testid="login-comp">
      {onLogin && <button onClick={() => onLogin('cred')}>Login</button>}
      {onPasswordLogin && (
        <button onClick={() => onPasswordLogin('sam@example.com', 'secret123')}>Password Login</button>
      )}
      {error && <span>{error}</span>}
      {isLoading && <span>loading</span>}
    </div>
  ),
}))

import { useAuth } from '../../hooks/useAuth/useAuth.js'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the login when not authenticated and does not redirect', () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      loginWithGoogle: vi.fn(),
      loginWithPassword: vi.fn(),
      error: null,
      isLoggingIn: false,
    })

    renderPage()
    expect(screen.getByTestId('login-comp')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('redirects to /chat once authenticated', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      loginWithGoogle: vi.fn(),
      loginWithPassword: vi.fn(),
      error: null,
      isLoggingIn: false,
    })

    renderPage()
    expect(navigate).toHaveBeenCalledWith('/chat', { replace: true })
  })

  it('passes the auth error through to the login', () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      loginWithGoogle: vi.fn(),
      loginWithPassword: vi.fn(),
      error: 'Only @example.com accounts are allowed.',
      isLoggingIn: false,
    })

    renderPage()
    expect(screen.getByText('Only @example.com accounts are allowed.')).toBeInTheDocument()
  })

  it('wires loginWithPassword into the login component', () => {
    const loginWithPassword = vi.fn()
    useAuth.mockReturnValue({
      isAuthenticated: false,
      loginWithGoogle: vi.fn(),
      loginWithPassword,
      error: null,
      isLoggingIn: false,
    })

    renderPage()
    screen.getByRole('button', { name: /password login/i }).click()
    expect(loginWithPassword).toHaveBeenCalledWith('sam@example.com', 'secret123')
  })

  it('only renders the sign-in methods enabled by the admin', () => {
    useAuthMethods.mockReturnValue({ google: true, password: false })
    useAuth.mockReturnValue({
      isAuthenticated: false,
      loginWithGoogle: vi.fn(),
      loginWithPassword: vi.fn(),
      error: null,
      isLoggingIn: false,
    })

    renderPage()
    expect(screen.getByRole('button', { name: /^login$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /password login/i })).not.toBeInTheDocument()
  })
})
