import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Router from './Router.jsx'

vi.mock('../pages/Chat/Chat.jsx', () => ({
  default: () => <div data-testid="chat-page" />,
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

  it('renders the admin page at /admin', () => {
    renderAt('/admin')
    expect(screen.getByTestId('admin-page')).toBeInTheDocument()
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

  it('renders the landing page at the root', () => {
    renderAt('/')
    expect(screen.getByTestId('landing-page')).toBeInTheDocument()
  })

  it('renders the landing page for unknown paths', () => {
    renderAt('/nope/nothing-here')
    expect(screen.getByTestId('landing-page')).toBeInTheDocument()
  })
})
