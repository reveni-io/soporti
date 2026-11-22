import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import BentoSection from './BentoSection.jsx'

describe('BentoSection', () => {
  it('presents what an answer can turn into', () => {
    const { container } = render(<BentoSection />)

    expect(container.querySelector('section')).toHaveAttribute('id', 'product')
    expect(screen.getByRole('heading', { level: 2, name: /when the answer is a deliverable/i })).toBeInTheDocument()
  })

  it('mentions pull requests among the deliverables', () => {
    render(<BentoSection />)

    expect(screen.getByText(/draft pull requests for the small fixes/i)).toBeInTheDocument()
  })

  it('shows one card per capability, with the bigger demos spanning two columns and the app closing the grid', () => {
    const { container } = render(<BentoSection />)

    const titles = screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)
    expect(titles).toEqual([
      'Reports, runbooks and dashboards',
      'Describe a job once',
      'Your playbooks as /commands',
      'Ask for a chart, keep a live dashboard',
      'Ask for the fix, get a draft pull request',
      'Product videos from a brief',
      'Specialists behind one assistant',
      'Soporti in your dock and in your pocket',
    ])
    expect(container.querySelectorAll('.lp-bento-card--wide')).toHaveLength(4)
    const landscapeCards = container.querySelectorAll('.lp-bento-card--landscape')
    expect(landscapeCards).toHaveLength(2)
    expect(landscapeCards[1]).toHaveTextContent(/install it on desktop or phone/i)
  })

  it('gives pull requests a full row of their own, from the request to the draft and its CI', () => {
    render(<BentoSection />)

    const card = screen
      .getByRole('heading', { level: 3, name: 'Ask for the fix, get a draft pull request' })
      .closest('article')
    expect(card).toHaveClass('lp-bento-card--wide', 'lp-bento-card--landscape')
    expect(card).toHaveTextContent(/never runs your code: CI checks it and a person merges it/i)
    expect(card.querySelector('[data-icon="pull-request"]')).toBeInTheDocument()
    expect(card.querySelector('.lp-pr-tile')).toHaveTextContent('Draft · #312')
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
