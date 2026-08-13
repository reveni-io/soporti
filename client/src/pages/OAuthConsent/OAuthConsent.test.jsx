import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import OAuthConsent from './OAuthConsent.jsx'

vi.mock('../../hooks/useAuth/useAuth.js', () => ({ useAuth: vi.fn() }))

const useAuthMethods = vi.fn(() => ({ google: true, password: true }))
vi.mock('../../hooks/useAuthMethods/useAuthMethods.js', () => ({ useAuthMethods: () => useAuthMethods() }))

vi.mock('../../common/Login/Login.jsx', () => ({
  default: ({ isLoading }) => <div data-testid="login-comp">{isLoading && <span>loading</span>}</div>,
}))

import { useAuth } from '../../hooks/useAuth/useAuth.js'

const SIGNED_IN = {
  isAuthenticated: true,
  user: { id: 7, email: 'jose@reveni.io', name: 'Jose' },
  token: 'session-token',
  logout: vi.fn(),
  loginWithGoogle: vi.fn(),
  loginWithPassword: vi.fn(),
  error: null,
  isLoggingIn: false,
}

const QUERY =
  '?client_id=cid&client_name=Claude%20Code&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb' +
  `&code_challenge=${'a'.repeat(43)}&code_challenge_method=S256&scope=mcp&state=xyz` +
  '&resource=https%3A%2F%2Fsoporti.test%2Fapi%2Fmcp'

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue(SIGNED_IN)
  useAuthMethods.mockReturnValue({ google: true, password: true })
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true })
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ redirectTo: 'https://claude.ai/cb?code=the-code&state=xyz' }),
  })
})

describe('OAuthConsent', () => {
  it('shows the login instead of the consent when there is no session', () => {
    useAuth.mockReturnValue({ ...SIGNED_IN, isAuthenticated: false })

    render(
      <MemoryRouter initialEntries={[`/oauth/consent${QUERY}`]}>
        <OAuthConsent />
      </MemoryRouter>
    )

    expect(screen.getByTestId('login-comp')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /connect/i })).not.toBeInTheDocument()
  })

  it('names the client and the account the grant is bound to', () => {
    render(
      <MemoryRouter initialEntries={[`/oauth/consent${QUERY}`]}>
        <OAuthConsent />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: /connect claude code/i })).toBeInTheDocument()
    expect(screen.getByText('jose@reveni.io')).toBeInTheDocument()
  })

  it('falls back to a generic name when the client did not register one', () => {
    render(
      <MemoryRouter initialEntries={[`/oauth/consent${QUERY.replace('&client_name=Claude%20Code', '')}`]}>
        <OAuthConsent />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: /connect an mcp client/i })).toBeInTheDocument()
  })

  it('refuses to render the consent when a required parameter is missing', () => {
    render(
      <MemoryRouter initialEntries={[`/oauth/consent${'?client_id=cid&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb'}`]}>
        <OAuthConsent />
      </MemoryRouter>
    )

    expect(screen.getByText(/authorization parameters are missing/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^connect$/i })).not.toBeInTheDocument()
  })

  it('posts the whole authorization request and follows the redirect the server returns', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={[`/oauth/consent${QUERY}`]}>
        <OAuthConsent />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: /^connect$/i }))

    await waitFor(() => expect(window.location.href).toBe('https://claude.ai/cb?code=the-code&state=xyz'))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/oauth/authorize')
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toBe('Bearer session-token')
    expect(JSON.parse(options.body)).toEqual({
      decision: 'allow',
      client_id: 'cid',
      redirect_uri: 'https://claude.ai/cb',
      code_challenge: 'a'.repeat(43),
      code_challenge_method: 'S256',
      scope: 'mcp',
      resource: 'https://soporti.test/api/mcp',
      state: 'xyz',
    })
  })

  it('sends a deny decision when the user cancels', async () => {
    const user = userEvent.setup()
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ redirectTo: 'https://claude.ai/cb?error=access_denied' }),
    })

    render(
      <MemoryRouter initialEntries={[`/oauth/consent${QUERY}`]}>
        <OAuthConsent />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => expect(window.location.href).toBe('https://claude.ai/cb?error=access_denied'))
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).decision).toBe('deny')
  })

  it('shows the server error and stays on the page when the approval fails', async () => {
    const user = userEvent.setup()
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error_description: 'nope', error: 'The redirect_uri is not registered.' }),
    })

    render(
      <MemoryRouter initialEntries={[`/oauth/consent${QUERY}`]}>
        <OAuthConsent />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: /^connect$/i }))

    expect(await screen.findByText('The redirect_uri is not registered.')).toBeInTheDocument()
    expect(window.location.href).toBe('')
  })

  it('logs the user out when the session expired mid-consent', async () => {
    const user = userEvent.setup()
    const logout = vi.fn()
    useAuth.mockReturnValue({ ...SIGNED_IN, logout })
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid or expired token.' }),
    })

    render(
      <MemoryRouter initialEntries={[`/oauth/consent${QUERY}`]}>
        <OAuthConsent />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: /^connect$/i }))

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/invalid or expired token/i)).not.toBeInTheDocument()
  })

  it('disables both buttons while the decision is in flight', async () => {
    const user = userEvent.setup()
    let release
    global.fetch.mockReturnValue(new Promise(resolve => (release = resolve)))

    render(
      <MemoryRouter initialEntries={[`/oauth/consent${QUERY}`]}>
        <OAuthConsent />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: /^connect$/i }))

    expect(screen.getByRole('button', { name: /connecting/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()

    release({ ok: true, status: 200, json: async () => ({ redirectTo: 'https://claude.ai/cb?code=c' }) })
    await waitFor(() => expect(window.location.href).toBe('https://claude.ai/cb?code=c'))
  })
})
