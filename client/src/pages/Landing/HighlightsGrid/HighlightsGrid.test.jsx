import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import HighlightsGrid from './HighlightsGrid.jsx'

describe('HighlightsGrid', () => {
  it('lists the everyday details, each with a title and a one-line explanation', () => {
    render(<HighlightsGrid />)

    const list = screen.getByRole('list', { name: 'Everyday details' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(8)
    expect(within(list).getByText('Support or Tech')).toBeInTheDocument()
    expect(within(list).getByText('Your model, your keys')).toBeInTheDocument()
    expect(within(list).getByText(/OpenAI or Anthropic/)).toBeInTheDocument()
    expect(within(list).getByText('Let Me Soporti That For You')).toBeInTheDocument()
  })
})
