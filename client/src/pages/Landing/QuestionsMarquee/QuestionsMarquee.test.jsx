import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import QuestionsMarquee from './QuestionsMarquee.jsx'
import { QUESTION_ROWS } from './questions.js'

describe('QuestionsMarquee', () => {
  it('lists every example question once for assistive technology', () => {
    render(<QuestionsMarquee />)

    const region = screen.getByRole('region', { name: /real questions, answered from the real system/i })
    const visibleItems = within(region).getAllByRole('listitem')

    expect(visibleItems).toHaveLength(QUESTION_ROWS.flat().length)
    expect(visibleItems[0]).toHaveTextContent(/signs up with an email that already exists/i)
  })

  it('repeats each row in a hidden copy so the loop never shows a gap', () => {
    const { container } = render(<QuestionsMarquee />)

    const rows = container.querySelectorAll('.lp-questions__row')
    expect(rows).toHaveLength(QUESTION_ROWS.length)
    rows.forEach((row, index) => {
      const [track, copy] = row.querySelectorAll('.lp-questions__track')
      expect(track).not.toHaveAttribute('aria-hidden')
      expect(copy).toHaveAttribute('aria-hidden', 'true')
      expect(copy.children).toHaveLength(QUESTION_ROWS[index].length)
    })
  })

  it('scrolls every other row the opposite way', () => {
    const { container } = render(<QuestionsMarquee />)

    const rows = container.querySelectorAll('.lp-questions__row')
    expect(rows[0]).not.toHaveClass('lp-questions__row--reverse')
    expect(rows[1]).toHaveClass('lp-questions__row--reverse')
  })

  it('tags each question with the logo of the source that answers it', () => {
    const { container } = render(<QuestionsMarquee />)

    const firstChip = container.querySelector('.lp-questions__chip')
    expect(firstChip.querySelector('[data-icon="github"]')).toBeInTheDocument()
  })
})
