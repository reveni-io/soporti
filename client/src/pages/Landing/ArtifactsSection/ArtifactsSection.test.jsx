import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ArtifactsSection from './ArtifactsSection.jsx'

describe('ArtifactsSection', () => {
  it('explains that an artifact opens beside the chat', () => {
    render(<ArtifactsSection />)

    expect(screen.getByText(/it opens beside the chat/)).toBeInTheDocument()
    expect(screen.getByText(/opens it in a panel next to the conversation/)).toBeInTheDocument()
  })

  it('says a revision becomes a version rather than replacing the artifact', () => {
    const { container } = render(<ArtifactsSection />)

    expect(screen.getByText(/Every revision is a version you can switch between/)).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-points li')).toHaveLength(6)
  })

  it('mentions the pdf export and the per-version delete', () => {
    render(<ArtifactsSection />)

    expect(screen.getByText(/exports as a PDF/)).toBeInTheDocument()
    expect(screen.getByText(/delete on its own/)).toBeInTheDocument()
  })

  it('states what the sandbox actually protects, without overclaiming', () => {
    render(<ArtifactsSection />)

    expect(screen.getByText(/cannot reach your session/)).toBeInTheDocument()
    expect(screen.getByText(/blocks every fetch/)).toBeInTheDocument()
  })

  it('mentions the standalone page and the shareable link', () => {
    render(<ArtifactsSection />)

    expect(screen.getByText(/Opens on its own page too/)).toBeInTheDocument()
    expect(screen.getByText(/no account needed/)).toBeInTheDocument()
  })

  it('says the charts match the ones in the chat', () => {
    render(<ArtifactsSection />)

    expect(screen.getByText(/charts drawn by the same library as the chat/)).toBeInTheDocument()
  })

  it('shows the animated artifact demo next to the copy', () => {
    const { container } = render(<ArtifactsSection />)

    expect(container.querySelector('.lp-artifacts-preview')).toBeInTheDocument()
  })
})
