import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import InstructionsSection from './InstructionsSection.jsx'

describe('InstructionsSection', () => {
  it('pitches custom instructions with their tags and the settings preview', () => {
    const { container } = render(<InstructionsSection />)

    expect(screen.getByRole('heading', { name: 'Teach Soporti how you work.' })).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-tags .lp-qcard__tag')).toHaveLength(4)
    expect(screen.getByText('Your role')).toBeInTheDocument()
    expect(container.querySelector('.lp-split__visual')).toBeInTheDocument()
  })
})
