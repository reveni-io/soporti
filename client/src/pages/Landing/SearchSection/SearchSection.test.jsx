import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SearchSection from './SearchSection.jsx'

describe('SearchSection', () => {
  it('explains that conversations are found by what was said, not only by title', () => {
    render(<SearchSection />)

    expect(screen.getByText('what was said')).toBeInTheDocument()
    expect(screen.getByText(/finds it by title or by content/)).toBeInTheDocument()
  })

  it('says how to get the full list back', () => {
    render(<SearchSection />)

    expect(screen.getByText(/press Esc, and the full list is back/)).toBeInTheDocument()
  })

  it('previews results with the matching words highlighted only where the content matched', () => {
    const { container } = render(<SearchSection />)

    expect(screen.getByText('Why is order 8412 stuck?')).toBeInTheDocument()
    expect(screen.getByText('Refund window for marketplace orders')).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-search__snippet')).toHaveLength(2)
    expect(container.querySelectorAll('mark')).toHaveLength(2)
  })
})
