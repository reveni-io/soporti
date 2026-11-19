import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import BentoSection from './BentoSection.jsx'

describe('BentoSection', () => {
  it('presents what an answer can turn into', () => {
    const { container } = render(<BentoSection />)

    expect(container.querySelector('section')).toHaveAttribute('id', 'product')
    expect(screen.getByRole('heading', { level: 2, name: /when the answer is a deliverable/i })).toBeInTheDocument()
  })

  it('shows one card per capability, with the bigger demos spanning two columns', () => {
    const { container } = render(<BentoSection />)

    const titles = screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)
    expect(titles).toEqual([
      'Reports, runbooks and dashboards',
      'Describe a job once',
      'Your playbooks as /commands',
      'Ask for a chart, keep a live dashboard',
      'Product videos from a brief',
      'Specialists behind one assistant',
    ])
    expect(container.querySelectorAll('.lp-bento-card--wide')).toHaveLength(3)
  })

  it('follows the pointer with the spotlight of every card', () => {
    const { container } = render(<BentoSection />)
    const card = container.querySelector('[data-spotlight]')
    card.getBoundingClientRect = () => ({ left: 10, top: 20 })

    fireEvent.pointerMove(container.querySelector('.lp-bento'), { clientX: 110, clientY: 70 })

    expect(card.style.getPropertyValue('--spot-x')).toBe('100px')
    expect(card.style.getPropertyValue('--spot-y')).toBe('50px')
  })

  it('closes with the everyday details', () => {
    render(<BentoSection />)

    expect(screen.getByRole('list', { name: 'Everyday details' })).toBeInTheDocument()
  })
})
