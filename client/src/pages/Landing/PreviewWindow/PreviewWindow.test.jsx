import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PreviewWindow from './PreviewWindow.jsx'

describe('PreviewWindow', () => {
  it('renders the window chrome around its content', () => {
    render(
      <PreviewWindow badge="3 skills">
        <p>Body</p>
      </PreviewWindow>
    )

    expect(screen.getByText('Soporti')).toBeInTheDocument()
    expect(screen.getByText('3 skills')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('leaves the badge out when there is none', () => {
    const { container } = render(<PreviewWindow>Body</PreviewWindow>)

    expect(container.querySelector('.lp-preview-window__badge')).not.toBeInTheDocument()
  })

  it('adds the given class to the window', () => {
    const { container } = render(<PreviewWindow className="hero-chat__window">Body</PreviewWindow>)

    expect(container.firstChild).toHaveClass('lp-preview-window', 'hero-chat__window')
  })
})
