import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProvidersSection from './ProvidersSection.jsx'
import { LLM_PROVIDERS } from './providers.js'

describe('ProvidersSection', () => {
  it('renders a card per supported provider with its example models', () => {
    const { container } = render(<ProvidersSection />)

    expect(container.querySelectorAll('.lp-prov')).toHaveLength(LLM_PROVIDERS.length)
    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('Anthropic')).toBeInTheDocument()
    expect(screen.getByText(/gpt-4o/)).toBeInTheDocument()
    expect(screen.getByText(/claude-opus-5/)).toBeInTheDocument()
  })

  it('says credentials are configured in /admin rather than through env vars', () => {
    render(<ProvidersSection />)

    expect(screen.getByText(/never an env var/i)).toBeInTheDocument()
    expect(screen.getByText('/admin')).toBeInTheDocument()
  })

  it('warns that the knowledge base still needs an OpenAI key on Anthropic', () => {
    render(<ProvidersSection />)

    expect(screen.getByText(/OpenAI Vector Stores whichever/i)).toBeInTheDocument()
  })

  it('is anchored so the nav can link to it', () => {
    const { container } = render(<ProvidersSection />)

    expect(container.querySelector('#providers')).toBeInTheDocument()
  })
})
