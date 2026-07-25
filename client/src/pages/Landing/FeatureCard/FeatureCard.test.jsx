import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FeatureCard from './FeatureCard.jsx'

describe('FeatureCard', () => {
  it('renders the icon, title and description', () => {
    render(<FeatureCard icon="🤝" title="Support profile" description="Behaviour-focused answers." />)

    expect(screen.getByText('🤝')).toBeInTheDocument()
    expect(screen.getByText('Support profile')).toBeInTheDocument()
    expect(screen.getByText('Behaviour-focused answers.')).toBeInTheDocument()
  })

  it('renders no list when there are no bullets', () => {
    render(<FeatureCard icon="🤝" title="Support profile" description="No bullets." />)

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('renders one item per bullet', () => {
    render(<FeatureCard icon="🔍" title="PR reviews" description="On three axes." bullets={['First', 'Second']} />)

    expect(screen.getAllByRole('listitem').map(node => node.textContent)).toEqual(['First', 'Second'])
  })

  it('applies the light modifier only when asked', () => {
    const { container, rerender } = render(<FeatureCard icon="x" title="t" description="d" />)
    expect(container.querySelector('.lp-feat')).not.toHaveClass('lp-feat--light')

    rerender(<FeatureCard icon="x" title="t" description="d" light />)

    expect(container.querySelector('.lp-feat')).toHaveClass('lp-feat--light')
  })
})
