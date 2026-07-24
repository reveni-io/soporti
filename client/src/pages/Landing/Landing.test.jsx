import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Landing from './Landing.jsx'

// Heavy, canvas/recharts-based children are mocked — the landing itself is just
// static content and the login/enter CTA logic we care about here.
vi.mock('../../common/GridPattern/GridPattern.jsx', () => ({ default: () => <div data-testid="grid" /> }))
vi.mock('../../common/ChartBlock/ChartBlock.jsx', () => ({ default: () => <div data-testid="chart" /> }))
vi.mock('../../common/CsvBlock/CsvBlock.jsx', () => ({ default: () => <div data-testid="csv" /> }))
vi.mock('./HeroChat/HeroChat.jsx', () => ({ default: () => <div data-testid="hero-chat" /> }))
vi.mock('./SettingsPreview/SettingsPreview.jsx', () => ({ default: () => <div data-testid="settings-preview" /> }))
vi.mock('react-syntax-highlighter', () => ({ Prism: ({ children }) => <pre>{children}</pre> }))
vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({ oneDark: {} }))

describe('Landing', () => {
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {}
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the hero headline', () => {
    render(<Landing />)
    expect(screen.getByText('how your product works')).toBeInTheDocument()
  })

  it('shows a "Log in" CTA to /login when there is no session', () => {
    render(<Landing />)
    const logins = screen.getAllByRole('link', { name: /log in/i })
    expect(logins.length).toBeGreaterThan(0)
    expect(logins[0]).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: /open soporti/i })).not.toBeInTheDocument()
  })

  it('shows an "Open Soporti" CTA to /chat when a session exists', () => {
    localStorage.setItem('auth_token', 'tok')
    render(<Landing />)
    const enter = screen.getAllByRole('link', { name: /open soporti/i })
    expect(enter.length).toBeGreaterThan(0)
    expect(enter[0]).toHaveAttribute('href', '/chat')
    expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument()
  })

  it('lists the connected integrations', () => {
    const { container } = render(<Landing />)
    // Scope to the integration cards — "GitHub" also appears as a nav/footer
    // source link, so query the card names specifically.
    const intNames = [...container.querySelectorAll('.lp-int__name')].map(el => el.textContent)
    expect(intNames).toContain('GitHub')
    expect(intNames).toContain('Help Center')
    expect(intNames).toContain('Shopify')
  })

  it('links to the public GitHub repository (nav + footer, always visible)', () => {
    render(<Landing hideCta />)
    const ghLinks = screen.getAllByRole('link', { name: /github/i })
    expect(ghLinks.length).toBeGreaterThanOrEqual(2)
    ghLinks.forEach(link => {
      expect(link).toHaveAttribute('href', 'https://github.com/reveni-io/soporti')
    })
  })

  it('shows real example questions', () => {
    render(<Landing />)
    expect(screen.getByText(/sign up with an email that already exists/i)).toBeInTheDocument()
  })

  it('embeds a real (pre-rendered) Mermaid diagram even without a session', () => {
    const { container } = render(<Landing />)
    const diagram = container.querySelector('.mermaid-diagram')
    expect(diagram).toBeTruthy()
    expect(diagram.querySelector('svg')).toBeTruthy()
  })

  it('falls back to the logged-out CTA when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled')
      },
    })
    render(<Landing />)
    const logins = screen.getAllByRole('link', { name: /log in/i })
    expect(logins.length).toBeGreaterThan(0)
    expect(logins[0]).toHaveAttribute('href', '/login')
  })

  // With an IntersectionObserver available, sections fade in as they scroll
  // into view instead of being visible from the start.
  describe('scroll reveal', () => {
    let observers

    class MockIntersectionObserver {
      constructor(callback) {
        this.callback = callback
        this.elements = []
        observers.push(this)
      }
      observe(el) {
        this.elements.push(el)
      }
      unobserve() {}
      disconnect() {}
    }

    beforeEach(() => {
      observers = []
      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    })

    const intersect = isIntersecting => {
      observers.forEach(io => io.elements.forEach(el => io.callback([{ isIntersecting, target: el }], io)))
    }

    it('reveals sections only when they scroll into view', () => {
      const { container } = render(<Landing />)
      expect(container.querySelector('.lp-reveal.is-visible')).toBeNull()

      // Off-screen entries change nothing.
      intersect(false)
      expect(container.querySelector('.lp-reveal.is-visible')).toBeNull()

      // Entering the viewport fades every observed section in.
      intersect(true)
      const revealed = container.querySelectorAll('.lp-reveal.is-visible')
      expect(revealed.length).toBeGreaterThan(0)
      expect(revealed.length).toBe(container.querySelectorAll('.lp-reveal').length)
    })
  })
})
