import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import Landing from './Landing.jsx'

vi.mock('../../common/GridPattern/GridPattern.jsx', () => ({ default: () => <div data-testid="grid" /> }))
vi.mock('../../common/ChartBlock/ChartBlock.jsx', () => ({ default: () => <div data-testid="chart" /> }))
vi.mock('../../common/CsvBlock/CsvBlock.jsx', () => ({ default: () => <div data-testid="csv" /> }))
vi.mock('react-syntax-highlighter', () => ({ Prism: ({ children }) => <pre>{children}</pre> }))
vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({ oneDark: {} }))

const INTRO_SEEN_KEY = 'soporti_landing_intro_seen'
const REPO = 'https://github.com/reveni-io/soporti'

describe('Landing', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    sessionStorage.setItem(INTRO_SEEN_KEY, '1')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders the hero headline', () => {
    render(<Landing />)

    expect(screen.getByRole('heading', { level: 1, name: /ask anything about your data/i })).toBeInTheDocument()
  })

  it('keeps its light app windows while the app itself is in the dark theme', () => {
    document.documentElement.setAttribute('data-theme', 'dark')

    const { container } = render(<Landing />)

    expect(container.firstChild).toHaveAttribute('data-theme', 'light')

    document.documentElement.removeAttribute('data-theme')
  })

  it('shows a "Log in" CTA to /login when there is no session', () => {
    render(<Landing />)

    const logins = screen.getAllByRole('link', { name: /log in/i })
    expect(logins.length).toBeGreaterThan(0)
    logins.forEach(link => expect(link).toHaveAttribute('href', '/login'))
    expect(screen.queryByRole('link', { name: /open soporti/i })).not.toBeInTheDocument()
  })

  it('shows an "Open Soporti" CTA to /chat when a session exists', () => {
    localStorage.setItem('auth_token', 'tok')

    render(<Landing />)

    const opens = screen.getAllByRole('link', { name: /open soporti/i })
    expect(opens.length).toBeGreaterThan(0)
    opens.forEach(link => expect(link).toHaveAttribute('href', '/chat'))
  })

  it('falls back to the logged-out CTA when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled')
      },
    })

    render(<Landing />)

    expect(screen.getAllByRole('link', { name: /log in/i })[0]).toHaveAttribute('href', '/login')
  })

  it('points every call to action to the repository on the public build', () => {
    render(<Landing hideCta />)

    expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument()
    const github = screen.getAllByRole('link', { name: /get it on github/i })
    expect(github).toHaveLength(2)
    github.forEach(link => expect(link).toHaveAttribute('href', REPO))
    expect(screen.getByLabelText('Soporti on GitHub')).toHaveAttribute('href', REPO)
    expect(screen.getByRole('link', { name: /view on github/i })).toHaveAttribute('href', REPO)
  })

  it('links every navigation item to a section of the page', () => {
    const { container } = render(<Landing />)

    const links = screen.getAllByRole('link').filter(link => link.getAttribute('href').startsWith('#'))
    expect(links.length).toBeGreaterThanOrEqual(5)
    links.forEach(link => expect(container.querySelector(link.getAttribute('href'))).toBeInTheDocument())
  })

  it('shows real example questions', () => {
    render(<Landing />)

    expect(screen.getAllByText(/signs up with an email that already exists/i).length).toBeGreaterThan(0)
  })

  it('presents the answers, the deliverables, the integrations, the automations, MCP and security', () => {
    render(<Landing />)

    expect(screen.getByRole('heading', { level: 2, name: /charts, tables, diagrams and code/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /when the answer is a deliverable/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /plugged into the tools/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /it keeps working/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /your other agents can ask soporti/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /zero blast radius/i })).toBeInTheDocument()
  })

  describe('intro', () => {
    beforeEach(() => {
      sessionStorage.clear()
      vi.stubGlobal('matchMedia', () => ({ matches: false }))
    })

    it('plays the intro on the first visit of the session and then hands over to the page', async () => {
      vi.useFakeTimers()
      const { container } = render(<Landing />)

      expect(container.querySelector('.lp-intro')).toBeInTheDocument()
      expect(container.firstChild).toHaveClass('lp--intro-playing')

      await act(async () => {
        vi.advanceTimersByTime(2300)
      })
      expect(container.firstChild).toHaveClass('lp--intro-leaving')

      await act(async () => {
        vi.advanceTimersByTime(1100)
      })
      expect(container.querySelector('.lp-intro')).not.toBeInTheDocument()
      expect(container.firstChild).toHaveClass('lp')
      expect(container.firstChild).not.toHaveClass('lp--intro-leaving')
    })

    it('holds the hero demo until the intro is gone', async () => {
      vi.useFakeTimers()
      render(<Landing />)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      expect(screen.queryByText('How many returns did Acme get in the last 7 days?')).not.toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1300)
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(screen.getByText('How many returns did Acme get in the last 7 days?')).toBeInTheDocument()
    })

    it('does not play again in the same session', () => {
      sessionStorage.setItem(INTRO_SEEN_KEY, '1')

      const { container } = render(<Landing />)

      expect(container.querySelector('.lp-intro')).not.toBeInTheDocument()
    })
  })

  describe('scroll reveal', () => {
    let observers

    class MockIntersectionObserver {
      constructor(callback) {
        this.callback = callback
        this.elements = []
        observers.push(this)
      }
      observe(element) {
        this.elements.push(element)
      }
      unobserve() {}
      disconnect() {}
    }

    function intersect(isIntersecting) {
      act(() => {
        observers.forEach(observer =>
          observer.elements.forEach(element => observer.callback([{ isIntersecting, target: element }], observer))
        )
      })
    }

    beforeEach(() => {
      observers = []
      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    })

    it('reveals each section only once it scrolls into view', () => {
      const { container } = render(<Landing />)
      const stages = container.querySelectorAll('.lp-stage')

      expect(stages.length).toBeGreaterThan(5)
      expect(container.querySelector('.lp-stage.is-visible')).toBeNull()

      intersect(false)
      expect(container.querySelector('.lp-stage.is-visible')).toBeNull()

      intersect(true)
      expect(container.querySelectorAll('.lp-stage.is-visible')).toHaveLength(stages.length)
    })
  })
})
