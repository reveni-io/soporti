import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ParallelSection from './ParallelSection.jsx'

describe('ParallelSection', () => {
  it('explains that a new question does not wait for the running answer', () => {
    render(<ParallelSection />)

    expect(screen.getByText(/before/)).toBeInTheDocument()
    expect(screen.getByText(/each conversation keeps its own answer coming/)).toBeInTheDocument()
  })

  it('says that leaving a conversation does not stop it', () => {
    render(<ParallelSection />)

    expect(screen.getByText(/it does not stop it/)).toBeInTheDocument()
  })

  it('previews the conversation list with every answer in flight marked', () => {
    render(<ParallelSection />)

    expect(screen.getByText('Why did the payout of order 8412 fail?')).toBeInTheDocument()
    expect(screen.getByText('How does the refund window work?')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Answering')).toHaveLength(2)
  })

  it('shows which of the conversations is the one being read', () => {
    const { container } = render(<ParallelSection />)

    const selected = container.querySelectorAll('.lp-parallel__item--selected')
    expect(selected).toHaveLength(1)
    expect(selected[0]).toHaveTextContent('Write the incident report for the webhook outage')
  })
})
