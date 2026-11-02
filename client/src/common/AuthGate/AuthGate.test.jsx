import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthGate from './AuthGate.jsx'

const auth = vi.hoisted(() => ({ current: {} }))

vi.mock('../../hooks/useAuth/useAuth.js', () => ({
  useAuth: () => auth.current,
}))

beforeEach(() => {
  vi.restoreAllMocks()
  auth.current = {
    isAuthenticated: false,
    loginWithGoogle: vi.fn(),
    loginWithPassword: vi.fn(),
    error: null,
    isLoggingIn: false,
  }
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ password: true }) })
})

describe('AuthGate', () => {
  it('renders the protected content when signed in', () => {
    auth.current.isAuthenticated = true

    render(
      <AuthGate>
        <p>Videos</p>
      </AuthGate>
    )

    expect(screen.getByText('Videos')).toBeInTheDocument()
  })

  it('shows the login screen with the enabled methods when signed out', async () => {
    const user = userEvent.setup()

    render(
      <AuthGate>
        <p>Videos</p>
      </AuthGate>
    )

    await user.type(await screen.findByPlaceholderText('Email'), 'ana@example.com')
    await user.type(screen.getByPlaceholderText('Password'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(screen.queryByText('Videos')).toBeNull()
    expect(auth.current.loginWithPassword).toHaveBeenCalledTimes(1)
    expect(auth.current.loginWithPassword).toHaveBeenCalledWith('ana@example.com', 'secret')
  })

  it('shows the sign-in error', async () => {
    auth.current.error = 'Invalid credentials'

    render(
      <AuthGate>
        <p>Videos</p>
      </AuthGate>
    )

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument()
  })
})
