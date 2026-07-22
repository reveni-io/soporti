import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Login from './Login.jsx'

vi.mock('@react-oauth/google', () => ({
  GoogleLogin: ({ onSuccess, onError }) => (
    <div>
      <button onClick={() => onSuccess({ credential: 'fake-credential' })}>Google Success</button>
      <button onClick={() => onError()}>Google Error</button>
    </div>
  ),
}))

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
