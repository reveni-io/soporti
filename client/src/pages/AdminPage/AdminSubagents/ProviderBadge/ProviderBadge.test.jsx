import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProviderBadge from './ProviderBadge.jsx'

describe('ProviderBadge', () => {
  it('renders its own provider and model', () => {
    render(<ProviderBadge provider="anthropic" model="claude-sonnet-5" globalProvider="openai" globalModel="gpt-5" />)

    expect(screen.getByText('claude-sonnet-5')).toBeInTheDocument()
    expect(screen.queryByText('follows global')).not.toBeInTheDocument()
  })

  it('renders the resolved global pair when it inherits', () => {
    render(<ProviderBadge provider={null} model={null} globalProvider="openai" globalModel="gpt-5" />)

    expect(screen.getByText('follows global')).toBeInTheDocument()
    expect(screen.getByText('gpt-5')).toBeInTheDocument()
  })

  it('renders the provider brand mark', () => {
    const { container } = render(
      <ProviderBadge provider="anthropic" model="claude-sonnet-5" globalProvider="openai" globalModel="gpt-5" />
    )

    expect(container.querySelector('[data-icon="anthropic"]')).toBeInTheDocument()
  })

  it('falls back to a monogram for a provider with no logo yet', () => {
    render(<ProviderBadge provider="mistral" model="mistral-large" globalProvider="openai" globalModel="gpt-5" />)

    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('keeps the full model id available on hover', () => {
    render(<ProviderBadge provider="openai" model="gpt-5-codex-preview" globalProvider="openai" globalModel="gpt-5" />)

    expect(screen.getByText('gpt-5-codex-preview')).toHaveAttribute('title', 'gpt-5-codex-preview')
  })
})
