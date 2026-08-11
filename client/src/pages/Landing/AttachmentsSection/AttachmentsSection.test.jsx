import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AttachmentsSection from './AttachmentsSection.jsx'

describe('AttachmentsSection', () => {
  it('names the three supported formats', () => {
    render(<AttachmentsSection />)

    expect(screen.getByText('.pdf')).toBeInTheDocument()
    expect(screen.getByText('.docx')).toBeInTheDocument()
    expect(screen.getByText('.xlsx')).toBeInTheDocument()
  })

  it('explains that an attachment stays in its conversation', () => {
    const { container } = render(<AttachmentsSection />)

    expect(screen.getByText(/Attach the spec instead of pasting it/)).toBeInTheDocument()
    expect(screen.getByText(/nothing is indexed or shared/)).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-points li')).toHaveLength(3)
  })
})
