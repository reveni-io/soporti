import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GoogleAccessButton from './GoogleAccessButton.jsx'

const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.readonly']

const google = vi.hoisted(() => ({ options: null, respond: null, scriptLoaded: true }))

vi.mock('@react-oauth/google', () => ({
  useGoogleOAuth: () => ({ scriptLoadedSuccessfully: google.scriptLoaded }),
  useGoogleLogin: options => {
    google.options = options
    return () => google.respond(options)
  },
}))

beforeEach(() => {
  google.options = null
  google.scriptLoaded = true
  google.respond = options => options.onSuccess({ code: 'the-code' })
})

describe('GoogleAccessButton', () => {
  it('renders the label with the Google mark', () => {
    const { container } = render(<GoogleAccessButton scopes={SCOPES} label="Connect Google" onCode={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeEnabled()
    expect(container.querySelectorAll('.google-access-button__mark path')).toHaveLength(4)
  })

  it('asks Google for an authorization code with exactly the given scopes', () => {
    render(<GoogleAccessButton scopes={SCOPES} label="Sign in with Google" selectAccount onCode={vi.fn()} />)

    expect(google.options).toMatchObject({
      flow: 'auth-code',
      scope: SCOPES.join(' '),
      overrideScope: true,
      select_account: true,
    })
  })

  it('does not force the account chooser unless asked to', () => {
    render(<GoogleAccessButton scopes={SCOPES} label="Connect Google" onCode={vi.fn()} />)

    expect(google.options.select_account).toBe(false)
  })

  it('hands the authorization code over when Google grants access', async () => {
    const onCode = vi.fn()
    const user = userEvent.setup()
    render(<GoogleAccessButton scopes={SCOPES} label="Connect Google" onCode={onCode} />)

    await user.click(screen.getByRole('button', { name: 'Connect Google' }))

    expect(onCode).toHaveBeenCalledTimes(1)
    expect(onCode).toHaveBeenCalledWith('the-code')
  })

  it('reports an error when Google refuses the request', async () => {
    google.respond = options => options.onError({ error: 'access_denied' })
    const onCode = vi.fn()
    const onError = vi.fn()
    const user = userEvent.setup()
    render(<GoogleAccessButton scopes={SCOPES} label="Connect Google" onCode={onCode} onError={onError} />)

    await user.click(screen.getByRole('button', { name: 'Connect Google' }))

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onCode).not.toHaveBeenCalled()
  })

  it('reports an error when the popup cannot open', async () => {
    google.respond = options => options.onNonOAuthError({ type: 'popup_failed_to_open' })
    const onError = vi.fn()
    const user = userEvent.setup()
    render(<GoogleAccessButton scopes={SCOPES} label="Connect Google" onCode={vi.fn()} onError={onError} />)

    await user.click(screen.getByRole('button', { name: 'Connect Google' }))

    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when the user closes the popup', async () => {
    google.respond = options => options.onNonOAuthError({ type: 'popup_closed' })
    const onCode = vi.fn()
    const onError = vi.fn()
    const user = userEvent.setup()
    render(<GoogleAccessButton scopes={SCOPES} label="Connect Google" onCode={onCode} onError={onError} />)

    await user.click(screen.getByRole('button', { name: 'Connect Google' }))

    expect(onError).not.toHaveBeenCalled()
    expect(onCode).not.toHaveBeenCalled()
  })

  it('is disabled when asked to', () => {
    render(<GoogleAccessButton scopes={SCOPES} label="Connect Google" disabled onCode={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeDisabled()
  })

  it('stays disabled until the Google script has loaded', () => {
    google.scriptLoaded = false

    render(<GoogleAccessButton scopes={SCOPES} label="Connect Google" onCode={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeDisabled()
  })
})
