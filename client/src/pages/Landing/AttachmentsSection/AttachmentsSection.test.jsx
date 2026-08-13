import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AttachmentsSection from './AttachmentsSection.jsx'

describe('AttachmentsSection', () => {
  it('names every supported format, documents and images', () => {
    render(<AttachmentsSection />)

    expect(screen.getByText('.pdf')).toBeInTheDocument()
    expect(screen.getByText('.docx')).toBeInTheDocument()
    expect(screen.getByText('.xlsx')).toBeInTheDocument()
    expect(screen.getByText('.png')).toBeInTheDocument()
    expect(screen.getByText('.jpg')).toBeInTheDocument()
    expect(screen.getByText('.webp')).toBeInTheDocument()
    expect(screen.getByText('.gif')).toBeInTheDocument()
  })

  it('explains that an attachment stays in its conversation', () => {
    const { container } = render(<AttachmentsSection />)

    expect(screen.getByText(/Show it instead of describing it/)).toBeInTheDocument()
    expect(screen.getByText(/nothing is indexed or shared/)).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-points li')).toHaveLength(5)
  })

  it('mentions pasting a screenshot and how long images are kept', () => {
    render(<AttachmentsSection />)

    expect(screen.getByText('Cmd+V')).toBeInTheDocument()
    expect(screen.getByText(/Screenshots stay available for 30 days/)).toBeInTheDocument()
  })
})
