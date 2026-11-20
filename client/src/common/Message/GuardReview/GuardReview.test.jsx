import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import GuardReview from './GuardReview.jsx'

const REVIEW = {
  setVersion: 7,
  minConfidence: 0.7,
  rows: [
    { questionId: 'q1', question: 'Is it unusual?', answer: 'Yes', confidence: 0.94, flagged: true, unsure: false },
    { questionId: 'q2', question: 'Does it match?', answer: null, confidence: 0.58, flagged: false, unsure: true },
    { questionId: 'q3', question: 'Is it safe?', answer: 'Yes', confidence: 0.9, flagged: false, unsure: false },
  ],
}

describe('GuardReview', () => {
  it('shows each answer of the guard, marking the ones to be careful with', () => {
    render(<GuardReview guard="Refunds" review={REVIEW} warnings={2} reason={null} />)

    expect(screen.getByText('Refunds guard · set v7')).toBeInTheDocument()
    expect(screen.getByText('Careful · 2 warnings')).toBeInTheDocument()
    const [, unusual, matches, safe] = screen.getAllByRole('row')
    expect(within(unusual).getByText('Careful')).toBeInTheDocument()
    expect(matches).toHaveTextContent('no answer0.58 < 0.70Careful')
    expect(within(safe).getByText('OK')).toBeInTheDocument()
  })

  it('says when there is nothing to be careful with', () => {
    render(<GuardReview guard="Legal" review={{ ...REVIEW, rows: [REVIEW.rows[2]] }} warnings={0} reason={null} />)

    expect(screen.getByText('No warnings')).toBeInTheDocument()
  })

  it('names one warning in the singular', () => {
    render(<GuardReview guard="Legal" review={REVIEW} warnings={1} reason={null} />)

    expect(screen.getByText('Careful · 1 warning')).toBeInTheDocument()
  })

  it('says why the guard could not review it', () => {
    render(<GuardReview guard="Legal" review={null} warnings={0} reason="the review could not run" />)

    expect(screen.getByText('Not reviewed: the review could not run.')).toBeInTheDocument()
  })
})
