import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Router from './Router.jsx'

vi.mock('../pages/Chat/Chat.jsx', () => ({
  default: ({ initialQuestion }) => <div data-testid="chat-page">{initialQuestion}</div>,
}))
vi.mock('../pages/Landing/Landing.jsx', () => ({
  default: () => <div data-testid="landing-page" />,
}))
vi.mock('../pages/LoginPage/LoginPage.jsx', () => ({
  default: () => <div data-testid="login-page" />,
}))
vi.mock('../pages/AdminPage/AdminPage.jsx', () => ({
  default: () => <div data-testid="admin-page" />,
}))
vi.mock('../pages/SharedView/SharedView.jsx', () => ({
  default: ({ shareId }) => <div data-testid="shared-view">{shareId}</div>,
}))
vi.mock('../pages/OAuthConsent/OAuthConsent.jsx', () => ({
  default: () => <div data-testid="oauth-consent-page" />,
}))
vi.mock('../pages/Lmstfy/Lmstfy.jsx', () => ({
  default: () => <div data-testid="lmstfy-page" />,
}))
vi.mock('../pages/ArtifactView/ArtifactView.jsx', () => ({
  default: ({ id }) => <div data-testid="artifact-view">{id}</div>,
}))
vi.mock('../pages/SharedArtifact/SharedArtifact.jsx', () => ({
  default: ({ shareId }) => <div data-testid="shared-artifact">{shareId}</div>,
}))

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Router />
    </MemoryRouter>
  )
}

describe('Router', () => {
  it('renders the login page at /login', () => {
    renderAt('/login')
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })

  it('renders the chat page at /chat', () => {
    renderAt('/chat')
    expect(screen.getByTestId('chat-page')).toBeInTheDocument()
  })

  it('hands the chat page the question the link carries', () => {
    renderAt('/chat?q=why%20did%20that%20refund%20fail%3F')
    expect(screen.getByTestId('chat-page')).toHaveTextContent('why did that refund fail?')
  })

  it('renders the chat page with no question when the link carries none', () => {
    renderAt('/chat')
    expect(screen.getByTestId('chat-page')).toBeEmptyDOMElement()
  })

  it('renders the public lmstfy page at /lmstfy', () => {
    renderAt('/lmstfy?q=how%20do%20refunds%20work')
    expect(screen.getByTestId('lmstfy-page')).toBeInTheDocument()
  })

  it('renders the admin page at /admin', () => {
    renderAt('/admin')
    expect(screen.getByTestId('admin-page')).toBeInTheDocument()
  })

  it('renders the consent page at /oauth/consent', () => {
    renderAt('/oauth/consent?client_id=cid')
    expect(screen.getByTestId('oauth-consent-page')).toBeInTheDocument()
  })

  it('renders the admin page on admin sub-routes', () => {
    renderAt('/admin/users')
    expect(screen.getByTestId('admin-page')).toBeInTheDocument()
  })

  it('renders the shared view for a hex share id', () => {
    renderAt('/share/abc123')
    expect(screen.getByTestId('shared-view')).toHaveTextContent('abc123')
  })

  it('falls back to the landing page for a non-hex share id', () => {
    renderAt('/share/not-hex!')
    expect(screen.getByTestId('landing-page')).toBeInTheDocument()
    expect(screen.queryByTestId('shared-view')).toBeNull()
  })

  it('renders the artifact view for a numeric id', () => {
    renderAt('/artifacts/3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601')
    expect(screen.getByTestId('artifact-view')).toHaveTextContent('3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601')
  })

  it('falls back to the landing page for a non-numeric artifact id', () => {
    renderAt('/artifacts/nope')
    expect(screen.getByTestId('landing-page')).toBeInTheDocument()
    expect(screen.queryByTestId('artifact-view')).toBeNull()
  })

  it('renders the public shared artifact for a 32-char hex share id', () => {
    const shareId = 'a'.repeat(32)
    renderAt(`/a/${shareId}`)
    expect(screen.getByTestId('shared-artifact')).toHaveTextContent(shareId)
  })

  it('falls back to the landing page for a malformed artifact share id', () => {
    renderAt('/a/short')
    expect(screen.getByTestId('landing-page')).toBeInTheDocument()
    expect(screen.queryByTestId('shared-artifact')).toBeNull()
  })

  it('renders the landing page at the root', () => {
    renderAt('/')
    expect(screen.getByTestId('landing-page')).toBeInTheDocument()
  })

  it('renders the landing page for unknown paths', () => {
    renderAt('/nope/nothing-here')
    expect(screen.getByTestId('landing-page')).toBeInTheDocument()
  })
})
