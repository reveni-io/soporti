import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Login from './Login.jsx'

const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.readonly']

const google = vi.hoisted(() => ({ options: null, respond: null }))

vi.mock('@react-oauth/google', () => ({
  GoogleLogin: ({ onSuccess, onError }) => (
    <div>
      <button onClick={() => onSuccess({ credential: 'fake-credential' })}>Google Success</button>
      <button onClick={() => onError()}>Google Error</button>
    </div>
  ),
  useGoogleOAuth: () => ({ scriptLoadedSuccessfully: true }),
  useGoogleLogin: options => {
    google.options = options
    return () => google.respond(options)
  },
}))

beforeEach(() => {
  google.options = null
  google.respond = options => options.onSuccess({ code: 'the-code' })
})

describe('Login', () => {
  it('renders title and subtitle', () => {
    render(<Login onLogin={vi.fn()} error={null} isLoading={false} />)
    expect(screen.getByText('Soporti')).toBeInTheDocument()
    expect(screen.getByText('Your AI teammate for code, data & docs')).toBeInTheDocument()
  })

  it('renders the Google sign-in button', () => {
    render(<Login onLogin={vi.fn()} error={null} isLoading={false} />)
    expect(screen.getByRole('button', { name: /google success/i })).toBeInTheDocument()
  })

  it('calls onLogin with the credential on success', async () => {
    const onLogin = vi.fn()
    const user = userEvent.setup()
    render(<Login onLogin={onLogin} error={null} isLoading={false} />)

    await user.click(screen.getByRole('button', { name: /google success/i }))

    expect(onLogin).toHaveBeenCalledWith('fake-credential')
  })

  it('calls onLogin with null when Google sign-in errors', async () => {
    const onLogin = vi.fn()
    const user = userEvent.setup()
    render(<Login onLogin={onLogin} error={null} isLoading={false} />)

    await user.click(screen.getByRole('button', { name: /google error/i }))

    expect(onLogin).toHaveBeenCalledWith(null)
  })

  it('keeps the ID-token button and no workspace note without google scopes', () => {
    render(<Login onLogin={vi.fn()} onGoogleCode={vi.fn()} googleScopes={null} error={null} isLoading={false} />)

    expect(screen.getByRole('button', { name: /google success/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument()
    expect(screen.queryByText(/read your Gmail and Calendar/i)).not.toBeInTheDocument()
  })

  it('asks for workspace access with its own button when google scopes are set', () => {
    render(<Login onLogin={vi.fn()} onGoogleCode={vi.fn()} googleScopes={SCOPES} error={null} isLoading={false} />)

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /google success/i })).not.toBeInTheDocument()
    expect(screen.getByText('Soporti will ask to read your Gmail and Calendar.')).toBeInTheDocument()
    expect(google.options).toMatchObject({ flow: 'auth-code', scope: SCOPES.join(' '), select_account: true })
  })

  it('signs in with the authorization code Google returns', async () => {
    const onLogin = vi.fn()
    const onGoogleCode = vi.fn()
    const user = userEvent.setup()
    render(<Login onLogin={onLogin} onGoogleCode={onGoogleCode} googleScopes={SCOPES} error={null} isLoading={false} />)

    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }))

    expect(onGoogleCode).toHaveBeenCalledTimes(1)
    expect(onGoogleCode).toHaveBeenCalledWith('the-code')
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('reports a refused workspace sign-in with a missing code', async () => {
    google.respond = options => options.onError({ error: 'access_denied' })
    const onGoogleCode = vi.fn()
    const user = userEvent.setup()
    render(<Login onLogin={vi.fn()} onGoogleCode={onGoogleCode} googleScopes={SCOPES} error={null} isLoading={false} />)

    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }))

    expect(onGoogleCode).toHaveBeenCalledTimes(1)
    expect(onGoogleCode).toHaveBeenCalledWith(null)
  })

  it('replaces the workspace button with the loading state while signing in', () => {
    render(<Login onLogin={vi.fn()} onGoogleCode={vi.fn()} googleScopes={SCOPES} error={null} isLoading={true} />)

    expect(screen.getByText('Logging in...')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument()
  })

  it('shows error message', () => {
    render(<Login onLogin={vi.fn()} error="Only @example.com accounts are allowed." isLoading={false} />)
    expect(screen.getByText('Only @example.com accounts are allowed.')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    render(<Login onLogin={vi.fn()} error={null} isLoading={true} />)
    expect(screen.getByText('Logging in...')).toBeInTheDocument()
  })

  it('hides the password form when onPasswordLogin is not provided', () => {
    render(<Login onLogin={vi.fn()} error={null} isLoading={false} />)
    expect(screen.queryByPlaceholderText('Email')).not.toBeInTheDocument()
  })

  it('hides the Google button and the divider when onLogin is not provided (admin login)', () => {
    render(<Login onPasswordLogin={vi.fn()} error={null} isLoading={false} />)
    expect(screen.queryByRole('button', { name: /google success/i })).not.toBeInTheDocument()
    expect(screen.queryByText('or')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
  })

  it('shows the divider only when both methods are present', () => {
    render(<Login onLogin={vi.fn()} onPasswordLogin={vi.fn()} error={null} isLoading={false} />)
    expect(screen.getByText('or')).toBeInTheDocument()
  })

  it('submits email and password through onPasswordLogin', async () => {
    const onPasswordLogin = vi.fn()
    const user = userEvent.setup()
    render(<Login onLogin={vi.fn()} onPasswordLogin={onPasswordLogin} error={null} isLoading={false} />)

    await user.type(screen.getByPlaceholderText('Email'), ' sam@example.com ')
    await user.type(screen.getByPlaceholderText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(onPasswordLogin).toHaveBeenCalledWith('sam@example.com', 'secret123')
  })

  it('keeps the submit button disabled until both fields are filled', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={vi.fn()} onPasswordLogin={vi.fn()} error={null} isLoading={false} />)

    const submit = screen.getByRole('button', { name: /sign in/i })
    expect(submit).toBeDisabled()

    await user.type(screen.getByPlaceholderText('Email'), 'sam@example.com')
    expect(submit).toBeDisabled()

    await user.type(screen.getByPlaceholderText('Password'), 'secret123')
    expect(submit).toBeEnabled()
  })

  it('disables the password form while loading', () => {
    render(<Login onLogin={vi.fn()} onPasswordLogin={vi.fn()} error={null} isLoading={true} />)
    expect(screen.getByPlaceholderText('Email')).toBeDisabled()
    expect(screen.getByPlaceholderText('Password')).toBeDisabled()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled()
  })
})
