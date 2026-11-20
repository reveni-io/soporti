import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SectionHeading from './SectionHeading.jsx'

describe('SectionHeading', () => {
  it('renders the eyebrow, the title as a level-two heading and the lead', () => {
    render(
      <SectionHeading
        eyebrow="MCP server"
        title={
          <>
            Your agents can <em>ask Soporti</em> too.
          </>
        }
        lead="Point any MCP client at one endpoint."
      />
    )

    expect(screen.getByText('MCP server')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Your agents can ask Soporti too.' })).toBeInTheDocument()
    expect(screen.getByText('Point any MCP client at one endpoint.')).toBeInTheDocument()
  })

  it('leaves the lead out when there is none and centers on request', () => {
    const { container } = render(<SectionHeading eyebrow="Security" title="Zero blast radius." isCentered />)

    expect(container.querySelector('.lp-lead')).toBeNull()
    expect(container.querySelector('.lp-heading')).toHaveClass('lp-heading--center')
  })
})
