import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import LandingHero from './LandingHero.jsx'

vi.mock('../../../common/GridPattern/GridPattern.jsx', () => ({ default: () => <div data-testid="grid" /> }))

const FIRST_SCENARIO_MS = 500 + 1000 + 1200 + 1250 + 450 + 170 * 7 + 4500

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('LandingHero', () => {
  it('announces the full headline and starts on the first topic', () => {
    render(<LandingHero cta={null} />)

    expect(
      screen.getByRole('heading', { level: 1, name: /ask anything about your data, orders, code, errors and docs/i })
    ).toBeInTheDocument()
    expect(screen.getByText('data')).toBeInTheDocument()
  })

  it('swaps the topic of the headline as the demo moves to the next question', async () => {
    vi.useFakeTimers()
    render(<LandingHero cta={null} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIRST_SCENARIO_MS + 500)
    })

    expect(screen.getByText('orders')).toBeInTheDocument()
    expect(screen.queryByText('data')).not.toBeInTheDocument()
    expect(screen.getByText('Look up order #1024 in Shopify for Acme')).toBeInTheDocument()
  })

  it('links to the product tour', () => {
    render(<LandingHero cta={null} />)

    expect(screen.getByRole('link', { name: /see it in action/i })).toHaveAttribute('href', '#answers')
  })

  it('renders the call to action it is given', () => {
    render(<LandingHero cta={{ href: '/login', label: 'Log in' }} />)

    const login = screen.getByRole('link', { name: /log in/i })
    expect(login).toHaveAttribute('href', '/login')
    expect(login).not.toHaveAttribute('target')
  })

  it('points the main button to the repository in a new tab when there is no call to action', () => {
    render(<LandingHero cta={null} />)

    const github = screen.getByRole('link', { name: /get it on github/i })
    expect(github).toHaveAttribute('href', 'https://github.com/reveni-io/soporti')
    expect(github).toHaveAttribute('target', '_blank')
    expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument()
  })
})
