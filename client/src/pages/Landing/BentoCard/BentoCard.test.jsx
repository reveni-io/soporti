import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BentoCard from './BentoCard.jsx'

describe('BentoCard', () => {
  it('shows its visual above the kicker, the title and the description', () => {
    const { container } = render(
      <BentoCard icon="bot" kicker="Bots" title="Describe a job once" description="A bot keeps doing it.">
        <p>Visual</p>
      </BentoCard>
    )

    expect(screen.getByText('Visual').closest('.lp-bento-card__visual')).toBeInTheDocument()
    expect(screen.getByText('Bots')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Describe a job once' })).toBeInTheDocument()
    expect(screen.getByText('A bot keeps doing it.')).toBeInTheDocument()
    expect(container.querySelector('[data-icon="bot"]')).toBeInTheDocument()
  })

  it('opts into the spotlight and spans two columns when it is wide', () => {
    const { container } = render(
      <BentoCard icon="chart" kicker="Analytics" title="Dashboards" description="Live." isWide index={3}>
        <p>Visual</p>
      </BentoCard>
    )

    const card = container.querySelector('article')
    expect(card).toHaveAttribute('data-spotlight')
    expect(card).toHaveClass('lp-bento-card--wide')
    expect(card.style.getPropertyValue('--i')).toBe('3')
  })
})
