import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ThemeToggle from './ThemeToggle.jsx'

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
  })

  it('offers the dark theme while the page is light', () => {
    render(<ThemeToggle />)

    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  })

  it('offers the light theme while the page is dark', () => {
    document.documentElement.setAttribute('data-theme', 'dark')

    render(<ThemeToggle />)

    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument()
  })

  it('switches the page theme back and forth and remembers the last choice', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }))

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(await screen.findByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }))

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem('soporti_theme')).toBe('light')
  })

  it('keeps the layout classes it is given', () => {
    render(<ThemeToggle className="icon-btn--inverse sidebar-footer__theme" />)

    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toHaveClass(
      'icon-btn',
      'icon-btn--inverse',
      'sidebar-footer__theme'
    )
  })
})
