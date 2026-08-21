import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LmstfySection from './LmstfySection.jsx'

describe('LmstfySection', () => {
  it('explains what the shared link does', () => {
    render(<LmstfySection />)

    expect(screen.getByRole('heading', { name: /answer the same question once/i })).toBeInTheDocument()
    expect(screen.getByText(/watches the question being typed into soporti/i)).toBeInTheDocument()
  })

  it('links to the public generator page', () => {
    render(<LmstfySection />)

    expect(screen.getByRole('link', { name: /make a link/i })).toHaveAttribute('href', '/lmstfy')
  })

  it('promises the answer stays behind the login', () => {
    render(<LmstfySection />)

    expect(screen.getByText(/nothing is exposed to the internet/i)).toBeInTheDocument()
  })
})
